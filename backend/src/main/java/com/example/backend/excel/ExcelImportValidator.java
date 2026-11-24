package com.example.backend.excel;

import com.example.backend.dto.coupon.CouponRequest;
import com.example.backend.dto.product.*;
import com.example.backend.dto.productvariant.ProductVariantRequest;
import com.example.backend.model.DiscountType;
import com.example.backend.repositories.AdminProductRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.net.URI;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.example.backend.excel.ImportModels.*;

@Component @RequiredArgsConstructor
public class ExcelImportValidator {
    private final ExcelCellReader reader;
    private final EntityManager em;
    private final Validator validator;
    private final AdminProductRepository products;

    public Plan validate(byte[] file,Kind kind){
        var rows=reader.read(file,kind);
        if(kind==Kind.promotions)return coupons(rows);
        var options=products.options();
        var parentRows=rows.stream().filter(r->r.sheet.equals("Products")).toList();
        var variantRows=rows.stream().filter(r->r.sheet.equals("Variants")).toList();
        var imageRows=rows.stream().filter(r->r.sheet.equals("Images")).toList();
        if(parentRows.isEmpty())throw ExcelCellReader.bad("Sheet Products khong co du lieu");
        for(var r:parentRows){
            required(r,"productKey",100);required(r,"title",200);required(r,"handle",255);money(r,"price",true);money(r,"compareAtPrice",false);bool(r,"available");
        }
        duplicates(parentRows,"productKey",false);duplicates(parentRows,"title",true);duplicates(parentRows,"handle",false);
        databaseDuplicates(parentRows,"title","select lower(p.title) from Product p where lower(p.title) in :values",true);
        databaseDuplicates(parentRows,"handle","select p.handle from Product p where p.handle in :values",false);
        var parentKeys=parentRows.stream().map(r->r.value("productKey")).filter(Objects::nonNull).collect(Collectors.toSet());
        var images=new HashMap<String,TreeMap<Integer,String>>();
        for(var r:imageRows){
            link(r,parentKeys);String url=required(r,"imageUrl",500);Integer position=integer(r,"imagePosition",true);
            try{var u=URI.create(url==null?"":url);if(u.getHost()==null || u.getUserInfo()!=null || !("http".equalsIgnoreCase(u.getScheme()) || "https".equalsIgnoreCase(u.getScheme())))throw new IllegalArgumentException();}
            catch(IllegalArgumentException error){r.error("imageUrl","URL","URL phải là HTTP(S) hợp lệ, không chứa thông tin đăng nhập.");}
            if(position!=null){var map=images.computeIfAbsent(r.value("productKey"),key->new TreeMap<>());if(map.putIfAbsent(position,url)==null){if(map.size()>20)r.error("imageUrl","LIMIT","Tối đa 20 ảnh trên một sản phẩm.");}else r.error("imagePosition","DUPLICATE","Thứ tự ảnh bị trùng trong sản phẩm.");}
        }
        var newVariants=new ArrayList<NewVariant>();
        for(var r:variantRows){
            link(r,parentKeys);required(r,"sku",100);required(r,"title",200);var price=money(r,"price",true);var compare=money(r,"compareAtPrice",false);var stock=integer(r,"stockQuantity",true);var available=bool(r,"available");
            for(String field:List.of("option1","option2","option3"))optionalLength(r,field,255);
            newVariants.add(new NewVariant(r.value("productKey"),new ProductVariantRequest(null,r.value("title"),r.value("sku"),available,price,compare,r.value("option1"),r.value("option2"),r.value("option3"),stock)));
        }
        duplicates(variantRows,"sku",false);databaseDuplicates(variantRows,"sku","select v.sku from ProductVariant v where v.sku in :values",false);
        var variantParents=variantRows.stream().map(v->v.value("productKey")).filter(Objects::nonNull).collect(Collectors.toSet());
        var result=new ArrayList<NewProduct>();
        for(var r:parentRows){
            if(!variantParents.contains(r.value("productKey")))r.error("productKey","VARIANT_REQUIRED","Mỗi sản phẩm import cần ít nhất một biến thể có SKU.");
            Long vendor=reference(r,"vendor",options.vendors()),type=reference(r,"productType",options.categories());
            var tags=new LinkedHashSet<Long>();
            if(r.value("tags")!=null)for(String value:r.value("tags").split(";",-1)){
                Long id=resolve(value,options.tags());if(id==null)r.error("tags","REFERENCE","Tag không tồn tại hoặc tên không xác định duy nhất. Dùng id:<ID> trong sheet Reference.");else tags.add(id);
            }
            if(tags.size()>100)r.error("tags","LIMIT","Tối đa 100 tag trên một sản phẩm.");
            var urls=images.get(r.value("productKey"));
            result.add(new NewProduct(r.value("productKey"),new ProductRequest(r.value("title"),r.value("handle"),r.value("description"),moneyValue(r,"price"),null,null,moneyValue(r,"compareAtPrice"),vendor,type,urls==null?List.of():new ArrayList<>(urls.values()),tags,booleanValue(r,"available"))));
        }
        return new Plan(rows,List.of(),result,newVariants);
    }
    private Plan coupons(List<Row> rows){
        var requests=new ArrayList<CouponRequest>();
        for(var r:rows){
            String code=required(r,"code",50);if(code!=null){code=code.toUpperCase(Locale.ROOT);r.values.put("code",code);}
            DiscountType type=null;try{type=DiscountType.valueOf(Objects.toString(r.value("discountType"),""));}catch(IllegalArgumentException invalid){r.error("discountType","ENUM","Chỉ hỗ trợ PERCENTAGE hoặc FIXED_AMOUNT.");}
            var value=money(r,"discountValue",true);var min=money(r,"minOrderValue",false);var limit=integer(r,"usageLimit",false);
            if(value!=null && value.signum()<=0)r.error("discountValue","POSITIVE","Giá trị giảm phải lớn hơn 0.");
            if(value!=null && type==DiscountType.PERCENTAGE && value.compareTo(BigDecimal.valueOf(100))>0)r.error("discountValue","PERCENTAGE","Phần trăm giảm không vượt quá 100.");
            if(limit!=null && limit==0)r.error("usageLimit","POSITIVE","Giới hạn sử dụng phải lớn hơn 0 hoặc để trống.");
            var start=date(r,"startDate");var end=date(r,"endDate");
            if(start!=null && end!=null && start.isAfter(end))r.error("endDate","DATE_RANGE","Ngày kết thúc phải bằng hoặc sau ngày bắt đầu, theo nghiệp vụ voucher hiện tại.");
            var request=new CouponRequest(code,type,value,min,start,end,limit,bool(r,"isActive"));
            for(var error:validator.validate(request))if(r.errors.stream().noneMatch(e->e.field().equals(error.getPropertyPath().toString())))r.error(error.getPropertyPath().toString(),"VALIDATION","Giá trị không hợp lệ theo quy tắc voucher.");
            requests.add(request);
        }
        duplicates(rows,"code",false);databaseDuplicates(rows,"code","select c.code from Coupon c where c.code in :values",false);
        return new Plan(rows,requests,List.of(),List.of());
    }
    private String required(Row r,String field,int length){String value=r.value(field);if(value==null)r.error(field,"REQUIRED","Trường bắt buộc.");else if(value.length()>length)r.error(field,"LENGTH","Độ dài tối đa "+length+" ký tự.");return value;}
    private void optionalLength(Row r,String field,int length){if(r.value(field)!=null && r.value(field).length()>length)r.error(field,"LENGTH","Độ dài tối đa "+length+" ký tự.");}
    private BigDecimal money(Row r,String field,boolean required){
        String value=r.value(field);if(value==null){if(required)r.error(field,"REQUIRED","Trường bắt buộc.");return null;}
        try{var n=new BigDecimal(value);if(n.signum()<0 || n.scale()>2 || n.precision()-(long)n.scale()>10)throw new NumberFormatException();return n;}
        catch(NumberFormatException invalid){r.error(field,"MONEY","Nhập số không âm, tối đa 10 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.");return null;}
    }
    private BigDecimal moneyValue(Row r,String field){try{return r.value(field)==null?null:new BigDecimal(r.value(field));}catch(NumberFormatException invalid){return null;}}
    private Integer integer(Row r,String field,boolean required){
        if(r.value(field)==null){if(required)r.error(field,"REQUIRED","Trường bắt buộc.");return null;}
        try{int n=new BigDecimal(r.value(field)).intValueExact();if(n<0)throw new ArithmeticException();return n;}
        catch(ArithmeticException|NumberFormatException invalid){r.error(field,"INTEGER","Nhập số nguyên từ 0 đến 2.147.483.647.");return null;}
    }
    private Boolean bool(Row r,String field){String value=r.value(field);if(!"true".equals(value) && !"false".equals(value)){r.error(field,"BOOLEAN","Chỉ nhập true hoặc false.");return null;}return Boolean.valueOf(value);}
    private Boolean booleanValue(Row r,String field){return r.value(field)==null?null:Boolean.valueOf(r.value(field));}
    private LocalDate date(Row r,String field){if(r.value(field)==null)return null;try{if(!r.value(field).matches("\\d{4}-\\d{2}-\\d{2}"))throw new IllegalArgumentException();return LocalDate.parse(r.value(field));}catch(IllegalArgumentException|java.time.DateTimeException invalid){r.error(field,"DATE","Nhập ngày dạng yyyy-MM-dd, không kèm giờ hoặc múi giờ.");return null;}}
    private void link(Row r,Set<String> keys){String key=required(r,"productKey",100);if(key==null || !keys.contains(key))r.error("productKey","ORPHAN","productKey không tồn tại trong sheet Products.");}
    private Long reference(Row r,String field,List<AdminProductDetail.Lookup> options){if(r.value(field)==null)return null;Long id=resolve(r.value(field),options);if(id==null)r.error(field,"REFERENCE","Không tồn tại, đã ngừng hoạt động hoặc tên không xác định duy nhất. Dùng id:<ID> trong sheet Reference.");return id;}
    private Long resolve(String text,List<AdminProductDetail.Lookup> options){
        String value=text.strip();boolean identifier=value.startsWith("id:");
        var matches=options.stream().filter(o->Boolean.TRUE.equals(o.active()) && (identifier?value.equals("id:"+o.id()):value.equalsIgnoreCase(o.name()))).toList();return matches.size()==1?matches.get(0).id():null;
    }
    private void duplicates(List<Row> rows,String field,boolean fold){
        var groups=rows.stream().filter(r->r.value(field)!=null).collect(Collectors.groupingBy(r->fold?r.value(field).toLowerCase(Locale.ROOT):r.value(field)));
        for(var group:groups.values())if(group.size()>1)for(var r:group)r.error(field,"DUPLICATE","Giá trị bị trùng trong file.");
    }
    private void databaseDuplicates(List<Row> rows,String field,String sql,boolean fold){
        var values=rows.stream().map(r->r.value(field)).filter(Objects::nonNull).map(v->fold?v.toLowerCase(Locale.ROOT):v).collect(Collectors.toSet());
        if(values.isEmpty())return;
        var existing=new HashSet<>(em.createQuery(sql,String.class).setParameter("values",values).getResultList());
        for(var r:rows)if(r.value(field)!=null && existing.contains(fold?r.value(field).toLowerCase(Locale.ROOT):r.value(field)))r.error(field,"DUPLICATE","Giá trị đã tồn tại trong database; CREATE_ONLY không ghi đè.");
    }
}
