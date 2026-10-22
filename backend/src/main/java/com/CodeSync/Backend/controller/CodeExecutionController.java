package com.CodeSync.Backend.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/execute")
public class CodeExecutionController {
    private static final Logger LOGGER = LoggerFactory.getLogger(CodeExecutionController.class);
    private static final int MAX_OUTPUT_LENGTH = 16_000;
    private static final int MAX_INPUT_LENGTH = 64_000;
    private static final Semaphore EXECUTION_SLOTS = new Semaphore(2);
    private static final Pattern JAVA_CLASS_NAME =
            Pattern.compile("public\\s+(?:final\\s+)?class\\s+([A-Za-z_$][\\w$]*)");

    private final int timeoutSeconds;

    public CodeExecutionController(
            @Value("${codesync.execution.timeout-seconds:5}") int timeoutSeconds
    ) {
        this.timeoutSeconds = Math.max(1, Math.min(timeoutSeconds, 30));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> execute(
            @Valid @RequestBody ExecutionRequest request,
            Authentication authentication
    ) throws IOException, InterruptedException {
        if (!EXECUTION_SLOTS.tryAcquire()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(result(false, -1, "", "Too many code executions are running. Try again shortly.", false, false));
        }

        try {
            return executeInContainer(request);
        } finally {
            EXECUTION_SLOTS.release();
        }
    }

    private ResponseEntity<Map<String, Object>> executeInContainer(ExecutionRequest request)
            throws IOException, InterruptedException {
        String language = request.language().toLowerCase(Locale.ROOT);
        String image;
        String extension;
        String sourceName = "Source";
        switch (language) {
            case "javascript", "js" -> {
                image = "node:22-alpine";
                extension = ".js";
            }
            case "python", "py" -> {
                image = "python:3.12-alpine";
                extension = ".py";
            }
            case "java" -> {
                image = "eclipse-temurin:21-jdk-alpine";
                extension = ".java";
                Matcher classMatcher = JAVA_CLASS_NAME.matcher(request.code());
                if (classMatcher.find()) {
                    sourceName = classMatcher.group(1);
                }
            }
            default -> {
                return ResponseEntity.ok(result(
                        false,
                        -1,
                        "",
                        "Execution is supported for JavaScript, Python, and Java only. "
                                + request.language() + " is not supported.",
                        false,
                        false
                ));
            }
        }

        Path tempDirectory = Files.createTempDirectory("codesync-execution-");
        String containerName = "codesync-" + UUID.randomUUID();
        Process process = null;
        try {
            Path source = tempDirectory.resolve(sourceName + extension);
            Files.writeString(source, request.code(), StandardCharsets.UTF_8);
            setContainerReadPermissions(tempDirectory, source);

            List<String> command = dockerCommand(
                    containerName,
                    tempDirectory,
                    image,
                    language,
                    sourceName
            );
            try {
                process = new ProcessBuilder(command).start();
            } catch (IOException exception) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(result(
                                false,
                                -1,
                                "",
                                "Docker is unavailable. Start Docker and pull the configured execution images.",
                                false,
                                false
                        ));
            }

            Process runningProcess = process;
            CompletableFuture<CapturedOutput> stdout = CompletableFuture.supplyAsync(
                    () -> capture(runningProcess.getInputStream())
            );
            CompletableFuture<CapturedOutput> stderr = CompletableFuture.supplyAsync(
                    () -> capture(runningProcess.getErrorStream())
            );
            CompletableFuture<Void> inputWriter = CompletableFuture.runAsync(
                    () -> writeInput(runningProcess, request.stdin())
            );

            boolean completed = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!completed) {
                stopContainer(containerName);
                process.destroyForcibly();
                process.waitFor();
            } else if (inputWriter.isDone()) {
                inputWriter.join();
            }

            CapturedOutput capturedStdout = stdout.join();
            CapturedOutput capturedStderr = stderr.join();
            boolean truncated = capturedStdout.truncated() || capturedStderr.truncated();
            String stderrText = capturedStderr.text();
            if (!completed) {
                stderrText = append(stderrText, "Execution timed out after " + timeoutSeconds + " seconds.");
            }
            if (truncated) {
                stderrText = append(stderrText, "[output truncated]");
            }

            int exitCode = completed ? process.exitValue() : -1;
            return ResponseEntity.ok(result(
                    completed && exitCode == 0,
                    exitCode,
                    capturedStdout.text(),
                    stderrText,
                    truncated,
                    !completed
            ));
        } finally {
            if (process != null && process.isAlive()) {
                stopContainer(containerName);
                process.destroyForcibly();
            }
            deleteTemporaryDirectory(tempDirectory);
        }
    }

    private static List<String> dockerCommand(
            String containerName,
            Path sourceDirectory,
            String image,
            String language,
            String sourceName
    ) {
        List<String> command = new ArrayList<>(List.of(
                "docker", "run", "--pull=never", "--rm", "--interactive",
                "--name", containerName,
                "--network", "none",
                "--memory", "128m",
                "--memory-swap", "128m",
                "--cpus", "0.5",
                "--pids-limit", "64",
                "--read-only",
                "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges",
                "--user", "1000:1000",
                "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m",
                "--mount",
                "type=bind,source=" + sourceDirectory.toAbsolutePath() + ",target=/workspace,readonly",
                "--workdir", "/workspace",
                image
        ));

        switch (language) {
            case "javascript", "js" -> command.addAll(List.of("node", "/workspace/" + sourceName + ".js"));
            case "python", "py" -> command.addAll(List.of("python3", "/workspace/" + sourceName + ".py"));
            case "java" -> command.addAll(List.of(
                    "sh",
                    "-c",
                    "mkdir -p /tmp/classes && javac -J-Xmx64m -d /tmp/classes /workspace/"
                            + sourceName + ".java && java -Xmx64m -cp /tmp/classes " + sourceName
            ));
            default -> throw new IllegalArgumentException("Unsupported language: " + language);
        }
        return command;
    }

    private void stopContainer(String containerName) {
        try {
            Process stopProcess = new ProcessBuilder("docker", "rm", "--force", containerName)
                    .redirectErrorStream(true)
                    .start();
            if (!stopProcess.waitFor(3, TimeUnit.SECONDS)) {
                stopProcess.destroyForcibly();
            }
        } catch (IOException exception) {
            LOGGER.warn("Unable to stop execution container {}", containerName, exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            LOGGER.warn("Interrupted while stopping execution container {}", containerName, exception);
        }
    }

    private static void writeInput(Process process, String stdin) {
        try (var output = process.getOutputStream()) {
            output.write(stdin.getBytes(StandardCharsets.UTF_8));
        } catch (IOException exception) {
            if (process.isAlive()) {
                throw new IllegalStateException("Unable to send standard input to the execution container.", exception);
            }
        }
    }

    private static void setContainerReadPermissions(Path directory, Path source) throws IOException {
        try {
            Files.setPosixFilePermissions(directory, Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE,
                    PosixFilePermission.GROUP_READ,
                    PosixFilePermission.GROUP_EXECUTE,
                    PosixFilePermission.OTHERS_READ,
                    PosixFilePermission.OTHERS_EXECUTE
            ));
            Files.setPosixFilePermissions(source, Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.GROUP_READ,
                    PosixFilePermission.OTHERS_READ
            ));
        } catch (UnsupportedOperationException ignored) {
            // Windows Docker Desktop uses host ACLs rather than POSIX file modes.
        }
    }

    private static CapturedOutput capture(InputStream input) {
        try (input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            boolean truncated = false;
            int read;
            while ((read = input.read(buffer)) != -1) {
                int remaining = MAX_OUTPUT_LENGTH - output.size();
                if (remaining > 0) {
                    output.write(buffer, 0, Math.min(remaining, read));
                }
                if (read > remaining) {
                    truncated = true;
                }
            }
            return new CapturedOutput(output.toString(StandardCharsets.UTF_8), truncated);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read execution output.", exception);
        }
    }

    private static Map<String, Object> result(
            boolean success,
            int exitCode,
            String stdout,
            String stderr,
            boolean truncated,
            boolean timedOut
    ) {
        return Map.of(
                "success", success,
                "exitCode", exitCode,
                "stdout", stdout,
                "stderr", stderr,
                "output", append(stdout, stderr),
                "truncated", truncated,
                "timedOut", timedOut
        );
    }

    private static String append(String first, String second) {
        if (first.isBlank()) return second;
        if (second.isBlank()) return first;
        return first + (first.endsWith("\n") ? "" : "\n") + second;
    }

    private static void deleteTemporaryDirectory(Path directory) throws IOException {
        try (var paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    LOGGER.warn("Unable to remove temporary execution file {}", path, exception);
                }
            }
        }
    }

    private record CapturedOutput(String text, boolean truncated) {
    }

    public record ExecutionRequest(
            @NotBlank @Size(max = 500_000) String code,
            @NotBlank @Size(max = 20) String language,
            @Size(max = 128) String fileName,
            @Size(max = MAX_INPUT_LENGTH) String stdin
    ) {
        public ExecutionRequest {
            stdin = stdin == null ? "" : stdin;
        }
    }
}
