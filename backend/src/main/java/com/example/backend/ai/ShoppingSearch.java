package com.example.backend.ai;

import java.util.*;
import java.util.regex.Pattern;

/** Generic keyword anchors complement embeddings; no product IDs or product-specific rules. */
public record ShoppingSearch(String query, List<String> terms, List<String> databaseTerms) {
    private static final Set<String> STOP = Set.of("toi", "minh", "ban", "can", "muon", "mua", "tim", "kiem", "giup", "hay",
            "cho", "mot", "vai", "nhung", "cac", "san", "pham", "loai", "nao", "co", "khong", "phu", "hop", "voi", "va",
            "la", "cua", "duoc", "tu", "van", "xin", "nhe", "nha", "duoi", "toi da", "den", "nghin", "ngan", "dong", "vnd");
    public static ShoppingSearch from(String message) {
        String normalized = ShoppingQuery.normalize(message)
                .replaceAll("(?:duoi|toi da|khong qua|khong vuot qua|it hon|tren|toi thieu|tu|den|toi|[<>]=?)\\s*" + ShoppingQuery.MONEY, " ");
        var terms = Arrays.stream(normalized.split("[^a-z0-9]+"))
                .filter(t -> t.length() > 1 && !t.matches("[0-9].*") && !STOP.contains(t)).distinct().limit(10).toList();
        var raw = new LinkedHashSet<String>();
        for (String word : message.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (terms.contains(ShoppingQuery.normalize(word))) raw.add(word);
        }
        raw.addAll(terms);
        return new ShoppingSearch(terms.isEmpty() ? normalized.trim() : String.join(" ", terms), terms, List.copyOf(raw));
    }
    private String label(CatalogProduct product) {
        var p = product.product();
        return ShoppingQuery.normalize(p.title() + " " + p.productTypeName() + " " + p.vendorName() + " " + String.join(" ", product.tags()));
    }
    public double lexicalScore(CatalogProduct product) {
        String label = label(product);
        return terms.isEmpty() ? 0 : terms.stream().filter(t -> word(label, t)).count() / (double) terms.size();
    }
    public boolean relevant(CatalogProduct product, ShoppingQuery constraints, double semanticScore) {
        if (!Boolean.TRUE.equals(product.product().isActive()) || !Boolean.TRUE.equals(product.product().available())) return false;
        if (!constraints.matchesCategory(product)) return false;
        if (!constraints.category().isEmpty()) return true;
        if (terms.isEmpty()) return semanticScore >= 0.65;
        // Short, explicit noun requests must actually mention that noun in catalog labels.
        if (terms.size() <= 4) return word(label(product), terms.getFirst()) && lexicalScore(product) >= 0.5;
        return lexicalScore(product) >= 0.4 || (semanticScore >= 0.65 && lexicalScore(product) > 0);
    }
    public boolean mentionsBrand(String brand) {
        return brand != null && !brand.isBlank() && word(query, ShoppingQuery.normalize(brand));
    }
    private static boolean word(String text, String term) {
        return Pattern.compile("(?<![a-z0-9])" + Pattern.quote(term) + "(?![a-z0-9])").matcher(text).find();
    }
}
