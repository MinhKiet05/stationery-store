package com.example.backend.ai;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** Deterministic money/category constraints; never trust a model to enforce a budget. */
public record ShoppingQuery(BigDecimal min, BigDecimal max, boolean strictMax, String category) {
    static final String MONEY = "([0-9]+(?:[.,][0-9]+)*)(?:\\s*(nghin|ngan|trieu|k|vnd|vndong|dong|d))?";
    public static String normalize(String value) {
        return Normalizer.normalize(value.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replace('đ', 'd');
    }
    public static ShoppingQuery parse(String message) {
        String text = normalize(message);
        var upper = Pattern.compile("(duoi|toi da|khong qua|khong vuot qua|it hon|<=|<)\\s*" + MONEY).matcher(text);
        BigDecimal max = null, min = null; boolean strict = false;
        if (upper.find()) { max = amount(upper.group(2), upper.group(3)); strict = Set.of("duoi", "it hon", "<").contains(upper.group(1)); }
        var lower = Pattern.compile("(?:tren|toi thieu|tu|>=|>)\\s*" + MONEY).matcher(text);
        if (lower.find()) min = amount(lower.group(1), lower.group(2));
        var range = Pattern.compile("tu\\s*" + MONEY + "\\s*(?:den|toi|-)\\s*" + MONEY).matcher(text);
        if (range.find()) { min = amount(range.group(1), range.group(2)); max = amount(range.group(3), range.group(4)); strict = false; }
        String category = "";
        if (text.contains("but bi")) category = "but bi";
        else if (text.contains("but gel")) category = "but gel";
        else if (text.matches(".*\\bbut\\b.*") && !text.contains("hoc ve")) category = "but";
        else if (Pattern.compile("(?U)\\b(sổ|vở|tập)\\b").matcher(message.toLowerCase(Locale.ROOT)).find()
                || text.contains("so tay") || text.contains("vo hoc") || text.contains("tap hoc")) category = "so|vo|tap";
        else if (text.contains("hoc ve") || text.contains("dung cu ve")) category = "ve|mau|chi|co";
        return new ShoppingQuery(min, max, strict, category);
    }
    private static BigDecimal amount(String number, String unit) {
        String normalized = number;
        if (unit != null && Set.of("k", "nghin", "ngan", "trieu").contains(unit)) {
            normalized = normalized.replace(',', '.');
            if (normalized.chars().filter(c -> c == '.').count() > 1) normalized = normalized.replace(".", "");
            return new BigDecimal(normalized).multiply(new BigDecimal(unit.equals("trieu") ? "1000000" : "1000"));
        }
        return new BigDecimal(normalized.replace(".", "").replace(",", ""));
    }
    public boolean matches(CatalogProduct candidate) {
        if (!candidate.sellable() || candidate.product().price() == null) return false;
        return matchesPrice(candidate.product().price()) && matchesCategory(candidate);
    }
    public boolean matchesPrice(BigDecimal price) {
        if (price == null || price.signum() < 0) return false;
        if (min != null && price.compareTo(min) < 0) return false;
        if (max != null && (strictMax ? price.compareTo(max) >= 0 : price.compareTo(max) > 0)) return false;
        return true;
    }
    public boolean matchesCategory(CatalogProduct candidate) {
        if (category.isEmpty()) return true;
        String label = normalize(candidate.product().title() + " " + candidate.product().productTypeName() + " " + String.join(" ", candidate.tags()));
        return Pattern.compile("\\b(?:" + category + ")\\b").matcher(label).find();
    }
}
