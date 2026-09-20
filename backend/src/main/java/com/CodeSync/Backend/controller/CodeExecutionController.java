package com.CodeSync.Backend.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/execute")
public class CodeExecutionController {
    private static final long TIMEOUT_SECONDS = 5;
    private static final int MAX_OUTPUT_LENGTH = 16_000;

    @PostMapping
    public ResponseEntity<Map<String, Object>> compile(
            @Valid @RequestBody CompileRequest request,
            Authentication authentication
    ) throws IOException, InterruptedException {
        String language = request.language().toLowerCase();
        String extension = switch (language) {
            case "javascript", "js" -> ".js";
            case "python", "py" -> ".py";
            case "java" -> ".java";
            default -> null;
        };

        if (extension == null) {
            return ResponseEntity.ok(Map.of(
                    "success", false,
                    "output", "Compiler checks are not configured for " + request.language()
            ));
        }

        Path tempDirectory = Files.createTempDirectory("codesync-compile-");
        String sourceName = "Source";
        if ("java".equals(language)) {
            Matcher classMatcher = Pattern.compile("public\\s+(?:final\\s+)?class\\s+([A-Za-z_$][\\w$]*)")
                    .matcher(request.code());
            if (classMatcher.find()) {
                sourceName = classMatcher.group(1);
            }
        }
        Path source = tempDirectory.resolve(sourceName + extension);
        Files.writeString(source, request.code(), StandardCharsets.UTF_8);

        try {
            String[] command = switch (language) {
                case "javascript", "js" -> new String[]{"node", "--check", source.toString()};
                case "python", "py" -> new String[]{"python", "-m", "py_compile", source.toString()};
                case "java" -> new String[]{"javac", source.toString()};
                default -> throw new IllegalStateException("Unsupported language");
            };

            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
            boolean completed = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                return ResponseEntity.ok(Map.of(
                        "success", false,
                        "output", "Compilation timed out after " + TIMEOUT_SECONDS + " seconds"
                ));
            }

            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (output.length() > MAX_OUTPUT_LENGTH) {
                output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n[output truncated]";
            }
            return ResponseEntity.ok(Map.of(
                    "success", process.exitValue() == 0,
                    "exitCode", process.exitValue(),
                    "output", output.isBlank() ? "Compilation successful" : output
            ));
        } finally {
            Files.walk(tempDirectory)
                    .sorted((left, right) -> right.compareTo(left))
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                        }
                    });
        }
    }

    public record CompileRequest(
            @NotBlank @Size(max = 500_000) String code,
            @NotBlank @Size(max = 20) String language,
            @Size(max = 128) String fileName
    ) {
    }
}
