package com.example.backend.ai;

public final class AiLog {
    private AiLog() {}
    public static String text(String text) {
        if (text == null) return "";
        String value = text.replaceAll("[\\p{Cntrl}]", " ");
        if (value.matches("(?is).*(bearer|password|token|secret|mật khẩu|mat khau|[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.).*"))
            return "[redacted sensitive input]";
        return value.substring(0, Math.min(value.length(), 1000));
    }
}
