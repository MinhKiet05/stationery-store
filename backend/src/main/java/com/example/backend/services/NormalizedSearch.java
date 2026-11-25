package com.example.backend.services;
import jakarta.persistence.criteria.*;
public final class NormalizedSearch {
    private NormalizedSearch() {}
    private static final String FROM = "àáâãäåèéêëìíîïòóôõöùúûüýÿāăąēĕėęěĩīĭįōŏőũūŭůűųŷơưǎǐǒǔǖǘǚǜǟǡǫǭǻḁḕḗḙḛḝḭḯṍṏṑṓṳṵṷṹṻẏẙạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ";
    private static final String TO = "aaaaaaeeeeiiiiooooouuuuyyaaaeeeeeiiiiooouuuuuuyouaiouuuuuaaooaaeeeeeiioooouuuuuyyaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyd";
    public static String text(String input) {
        return java.text.Normalizer.normalize(input, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").replace('đ','d').replace('Đ','D').toLowerCase(java.util.Locale.ROOT);
    }
    public static String pattern(String input) { return "%"+text(input).replace("!","!!").replace("%","!%").replace("_","!_")+"%"; }
    public static Expression<String> expression(CriteriaBuilder cb, Expression<String> value) {
        return cb.function("translate",String.class,cb.lower(value),cb.literal(FROM),cb.literal(TO));
    }
    public static String hql(String value) { return "translate(lower("+value+"),'"+FROM+"','"+TO+"')"; }
}
