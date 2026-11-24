package com.example.backend.excel;

import com.example.backend.dto.productvariant.ProductVariantRequest;
import com.example.backend.services.*;
import com.example.backend.ai.AiProperties;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.*;
import static com.example.backend.excel.ImportModels.*;

@Service @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class ExcelImportService {
    private final ExcelImportValidator validator;
    private final ExcelCellReader reader;
    private final CouponService coupons;
    private final ProductService products;
    private final ProductVariantService variants;
    private final SecretKey jwtSecret;
    private final Clock statisticsClock;
    private final AiProperties aiProperties;
    private final EntityManager em;
    @Transactional(readOnly=true)
    public Preview preview(byte[] file,Kind kind,String admin){
        var plan=validator.validate(file,kind);
        boolean valid=plan.rows().stream().allMatch(r->r.errors.isEmpty());
        var rows=plan.rows().stream().map(r->new PreviewRow(r.sheet,r.rowNumber,Map.copyOf(r.values),r.status(),List.copyOf(r.errors))).toList();
        return new Preview(rows.size(),rows.stream().filter(r->r.status().equals("VALID")).count(),rows.stream().filter(r->r.status().equals("INVALID")).count(),rows.stream().filter(r->r.status().equals("DUPLICATE")).count(),valid,rows,valid?token(file,kind,admin,statisticsClock.instant().getEpochSecond()+900):null,reader.maxFileBytes,reader.maxRows);
    }
    @Transactional
    public Result confirm(byte[] file,Kind kind,String admin,String token){
        verify(file,kind,admin,token);
        // Serialize import confirmations across instances using one existing ADMIN row.
        // Role/status changes lock ADMIN rows in the same ascending order. This also
        // protects the existing case-insensitive product-title rule (no DB unique key).
        // Normal reads/checkout do not acquire this lock; no inventory row is touched.
        if(em.createNativeQuery("select user_id from store.users where role='ADMIN' order by user_id limit 1 for update",Long.class).getResultList().isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Quyen quan tri da thay doi. Vui long kiem tra lai");
        var actors=em.createQuery("select u.userID from User u where u.username=:name and u.role=ADMIN and u.isActive=true",Long.class).setParameter("name",admin).getResultList();
        if(actors.isEmpty())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Quyen ADMIN da thay doi");
        var plan=validator.validate(file,kind);
        if(plan.rows().stream().anyMatch(r->!r.errors.isEmpty()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Du lieu da thay doi hoac file co loi. Vui long kiem tra lai file");
        if(kind==Kind.promotions){coupons.createBatch(plan.coupons());return new Result("CREATED",plan.coupons().size(),0,0,plan.coupons().size(),"NOT_APPLICABLE");}
        var saved=products.createBatch(plan.products().stream().map(NewProduct::request).toList());
        var ids=new HashMap<String,Long>();for(int i=0;i<saved.size();i++)ids.put(plan.products().get(i).key(),saved.get(i).productID());
        var requests=new ArrayList<ProductVariantRequest>();
        for(var variant:plan.variants()){
            var r=variant.request();requests.add(new ProductVariantRequest(ids.get(variant.key()),r.title(),r.sku(),r.available(),r.price(),r.compareAtPrice(),r.option1(),r.option2(),r.option3(),r.stockQuantity()));
        }
        variants.createBatch(requests);em.flush();
        // Existing ProductIndexJob scans committed pages and retries on every schedule.
        // No Gemini/Cloudinary call or vector write occurs in this transaction.
        return new Result("CREATED",saved.size()+requests.size(),saved.size(),requests.size(),0,aiProperties.isEnabled()?"SCHEDULED":"DISABLED");
    }
    private String token(byte[] file,Kind kind,String admin,long expires){String prefix=expires+"."+hash(file);return prefix+"."+signature(kind,admin,prefix);}
    private void verify(byte[] file,Kind kind,String admin,String token){
        try{
            if(token==null || token.length()>180)throw new IllegalArgumentException();
            String[] parts=token.split("\\.",-1);if(parts.length!=3)throw new IllegalArgumentException();
            long expiry=Long.parseLong(parts[0]),now=statisticsClock.instant().getEpochSecond();
            if(expiry<=now || expiry>now+900 || !hash(file).equals(parts[1]) || !MessageDigest.isEqual(signature(kind,admin,parts[0]+"."+parts[1]).getBytes(StandardCharsets.US_ASCII),parts[2].getBytes(StandardCharsets.US_ASCII)))throw new IllegalArgumentException();
        }catch(RuntimeException invalid){throw new ResponseStatusException(HttpStatus.CONFLICT,"Preview het han hoac khong khop file/tai khoan. Vui long preview lai");}
    }
    private String hash(byte[] file){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(file));}catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}}
    private String signature(Kind kind,String admin,String value){
        try{var mac=Mac.getInstance("HmacSHA256");mac.init(jwtSecret);String input="stationery-excel-import-v1:"+admin.length()+":"+admin+":"+kind+":"+value;return HexFormat.of().formatHex(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.GeneralSecurityException impossible){throw new IllegalStateException(impossible);}
    }
}
