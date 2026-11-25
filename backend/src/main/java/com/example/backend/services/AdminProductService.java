package com.example.backend.services;
import com.example.backend.dto.product.*;
import com.example.backend.dto.productvariant.*;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.*;
@Service @RequiredArgsConstructor @Transactional(readOnly=true) @PreAuthorize("hasRole('ADMIN')")
public class AdminProductService {
    private final EntityManager em;
    private final AdminProductRepository repository;
    private final ProductService products;
    private final ProductVariantService variants;
    @Value("${app.inventory.low-stock-threshold:10}") private int threshold;
    public AdminProductRepository.Filter filter(AdminProductFilter f) {
        String s=f.search()==null?"":f.search().strip();
        if(s.length()>150 || threshold<1 || f.productTypeID()!=null&&f.productTypeID()<1 || f.vendorID()!=null&&f.vendorID()<1)throw bad();
        String pattern=s.isEmpty()?null:"%"+s.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        return new AdminProductRepository.Filter(pattern,f.productTypeID(),f.vendorID(),f.status(),Boolean.TRUE.equals(f.lowStock()),f.sort()==AdminProductFilter.Sort.ID_ASC,threshold);
    }
    public Page<AdminProductRow> list(AdminProductFilter f,int page,int size) {
        if(page<0||size<1||size>50||(long)page*size>Integer.MAX_VALUE)throw bad();
        var filter=filter(f);return new PageImpl<>(repository.find(filter,page*size,size),PageRequest.of(page,size),repository.count(filter));
    }
    public AdminProductDetail.Statistics statistics(AdminProductFilter f){return repository.statistics(filter(f));}
    public AdminProductDetail.Options options(){return repository.options();}
    public AdminProductDetail detail(Long id) {
        Product p=find(id,false);
        return new AdminProductDetail(ProductMapper.toResponse(p),p.getTags().stream().sorted(Comparator.comparing(Tag::getTagID))
            .map(t->new AdminProductDetail.Lookup(t.getTagID(),t.getName(),true)).toList(),repository.variants(List.of(id)),token(p),threshold);
    }
    @Transactional public AdminProductDetail create(AdminProductDetail.Write body) {
        validate(body.product());var saved=products.createProduct(body.product());em.flush();return detail(saved.productID());
    }
    @Transactional public AdminProductDetail update(Long id,AdminProductDetail.Write body) {
        var p=find(id,true);check(p,body.expectedState());validate(body.product());products.updateProduct(id,body.product());em.flush();return detail(id);
    }
    @Transactional public AdminProductDetail status(Long id,AdminProductDetail.Status body) {
        var p=find(id,true);check(p,body.expectedState());if(body.available()==null)throw bad();
        if(!Boolean.TRUE.equals(p.getIsActive()))throw conflict();p.setAvailable(body.available());em.flush();return detail(id);
    }
    @Transactional public void delete(Long id,String expected) {
        var p=find(id,true);check(p,expected);products.deleteProduct(id);em.flush();
    }
    @Transactional public ProductVariantResponse createVariant(Long id,AdminProductDetail.VariantWrite body) {
        var p=find(id,true);if(!Boolean.TRUE.equals(p.getIsActive()))throw conflict();
        var v=body.variant();if(v==null||!Objects.equals(id,v.productID()))throw bad();
        int stock;
        try {stock=body.initialStock().intValueExact();}catch(ArithmeticException|NullPointerException invalid){throw bad();}
        if(stock<0)throw bad();
        return variants.createVariant(new ProductVariantRequest(id,v.title(),v.sku(),v.available(),v.price(),v.compareAtPrice(),v.option1(),v.option2(),v.option3(),stock));
    }
    @Transactional public ProductVariantResponse updateVariant(Long id,Long variantID,AdminProductDetail.VariantWrite body) {
        // Inventory operations lock variants in ascending order. Product metadata is never locked by checkout.
        var p=find(id,true);if(!Boolean.TRUE.equals(p.getIsActive()))throw conflict();
        var v=em.find(ProductVariant.class,variantID);if(v==null||!Objects.equals(v.getProduct().getProductID(),id))throw missing();
        em.refresh(v,LockModeType.PESSIMISTIC_WRITE);
        if(body.expectedVersion()==null||!Objects.equals(v.getVersion(),body.expectedVersion()))throw conflict();
        var q=body.variant();if(q==null||!Objects.equals(q.productID(),id))throw bad();
        // Stock has a dedicated version-checked endpoint. Metadata edits preserve the locked current quantity.
        return variants.updateVariant(variantID,new ProductVariantRequest(id,q.title(),q.sku(),q.available(),q.price(),q.compareAtPrice(),q.option1(),q.option2(),q.option3(),v.getStockQuantity()));
    }
    private Product find(Long id,boolean lock) {
        Product p=em.find(Product.class,id);if(p==null)throw missing();if(lock)em.refresh(p,LockModeType.PESSIMISTIC_WRITE);return p;
    }
    private void check(Product p,String expected){if(expected==null||!Objects.equals(expected,token(p)))throw conflict();}
    private String token(Product p) {
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            var fields=new ArrayList<Object>(Arrays.asList(p.getProductID(),p.getTitle(),p.getHandle(),p.getDescription(),decimal(p.getPrice()),decimal(p.getPriceMin()),decimal(p.getPriceMax()),decimal(p.getCompareAtPrice()),p.getAvailable(),p.getIsActive(),p.getVendor()==null?null:p.getVendor().getVendorID(),p.getProductType()==null?null:p.getProductType().getProductTypeID()));
            fields.addAll(p.getImages());fields.add("TAGS");fields.addAll(p.getTags().stream().map(Tag::getTagID).sorted().toList());
            for(Object field:fields){byte[] bytes=(field==null?"N":"V"+field).getBytes(StandardCharsets.UTF_8);digest.update((bytes.length+":").getBytes(StandardCharsets.UTF_8));digest.update(bytes);}
            return HexFormat.of().formatHex(digest.digest());
        }catch(NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
    }
    private String decimal(BigDecimal value){return value==null?null:value.stripTrailingZeros().toPlainString();}
    private void validate(ProductRequest q) {
        if(q==null||q.title()==null||q.title().isBlank()||q.title().length()>200||q.available()==null||q.images()==null||q.images().size()>20||q.tagIDs()==null||q.tagIDs().size()>100)throw bad();
        for(BigDecimal price:Arrays.asList(q.price(),q.priceMin(),q.priceMax(),q.compareAtPrice()))if(price!=null&&(price.signum()<0||price.scale()>2||price.precision()-price.scale()>10))throw bad();
        for(String url:q.images()) {try {URI u=URI.create(url);if(url.length()>500||u.getHost()==null||u.getUserInfo()!=null||!("https".equalsIgnoreCase(u.getScheme())||"http".equalsIgnoreCase(u.getScheme())))throw bad();}catch(IllegalArgumentException|NullPointerException invalid){throw bad();}}
    }
    private ResponseStatusException bad(){return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Du lieu san pham khong hop le");}
    private ResponseStatusException missing(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"San pham hoac bien the khong ton tai");}
    private ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"Du lieu da thay doi. Vui long tai lai");}
}
