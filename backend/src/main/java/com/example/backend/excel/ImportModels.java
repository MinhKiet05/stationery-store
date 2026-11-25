package com.example.backend.excel;

import com.example.backend.dto.coupon.CouponRequest;
import com.example.backend.dto.product.ProductRequest;
import com.example.backend.dto.productvariant.ProductVariantRequest;
import java.util.*;

public final class ImportModels {
    private ImportModels() {}
    public enum Kind { products, promotions }
    public record Issue(String field,String code,String message) {}
    public static final class Row {
        public final String sheet;
        public final int rowNumber;
        public final Map<String,String> values = new LinkedHashMap<>();
        public final List<Issue> errors = new ArrayList<>();
        public Row(String sheet,int number){this.sheet=sheet;this.rowNumber=number;}
        public void error(String field,String code,String message){errors.add(new Issue(field,code,message));}
        public String value(String name){String v=values.get(name);return v==null || v.isBlank()?null:v.strip();}
        public String status(){return errors.stream().anyMatch(e->e.code().equals("DUPLICATE"))?"DUPLICATE":errors.isEmpty()?"VALID":"INVALID";}
    }
    public record PreviewRow(String sheet,int rowNumber,Map<String,String> values,String status,List<Issue> errors) {}
    public record Preview(int totalRows,long validRows,long invalidRows,long duplicateRows,boolean canImport,List<PreviewRow> rows,String importToken,long maxFileBytes,int maxRows) {}
    public record NewProduct(String key,ProductRequest request) {}
    public record NewVariant(String key,ProductVariantRequest request) {}
    public record Plan(List<Row> rows,List<CouponRequest> coupons,List<NewProduct> products,List<NewVariant> variants) {}
    public record Result(String status,int createdRecords,int createdProducts,int createdVariants,int createdVouchers,String aiStatus) {}
}
