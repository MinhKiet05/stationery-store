package com.example.backend.repositories;
import com.example.backend.dto.product.*;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import java.util.*;
@Repository @RequiredArgsConstructor
public class AdminProductRepository {
    private final EntityManager em;
    public record Filter(String pattern,Long category,Long vendor,AdminProductFilter.Status status,boolean lowStock,boolean ascending,int threshold) {}
    private static final String LOW = "p.isActive = true and p.available = true and exists (select v.variantID from ProductVariant v where v.product = p and v.available = true and v.stockQuantity < :threshold)";
    private String where(Filter f) {
        String s=" where 1=1";
        if(f.pattern()!=null) s+=" and (lower(p.title) like :pattern escape '!' or exists(select q.variantID from ProductVariant q where q.product=p and lower(q.sku) like :pattern escape '!'))";
        if(f.category()!=null) s+=" and p.productType.productTypeID=:category";
        if(f.vendor()!=null) s+=" and p.vendor.vendorID=:vendor";
        if(f.status()==AdminProductFilter.Status.SELLING) s+=" and p.isActive=true and p.available=true";
        if(f.status()==AdminProductFilter.Status.HIDDEN) s+=" and p.isActive=true and (p.available=false or p.available is null)";
        if(f.status()==AdminProductFilter.Status.DELETED) s+=" and p.isActive=false";
        if(f.lowStock()) s+=" and ("+LOW+")";
        return s;
    }
    private <T> TypedQuery<T> query(String sql,Class<T> type,Filter f) {
        var q=em.createQuery(sql,type);
        if(f.pattern()!=null)q.setParameter("pattern",f.pattern());
        if(f.category()!=null)q.setParameter("category",f.category());
        if(f.vendor()!=null)q.setParameter("vendor",f.vendor());
        if(sql.contains(":threshold"))q.setParameter("threshold",f.threshold());
        return q;
    }
    public long count(Filter f){return query("select count(p) from Product p"+where(f),Long.class,f).getSingleResult();}
    public AdminProductDetail.Statistics statistics(Filter f) {
        long total=count(f);
        long selling=query("select count(p) from Product p"+where(f)+" and p.isActive=true and p.available=true",Long.class,f).getSingleResult();
        long low=query("select count(p) from Product p"+where(f)+" and ("+LOW+")",Long.class,f).getSingleResult();
        return new AdminProductDetail.Statistics(total,selling,total-selling,low,f.threshold());
    }
    public List<AdminProductRow> find(Filter f,int offset,int size) {
        return query("""
            select new com.example.backend.dto.product.AdminProductRow(p.productID,p.title,photo,c.name,b.name,p.available,p.isActive,
                coalesce(min(v.price),p.price),coalesce(max(v.price),p.price),coalesce(sum(cast(v.stockQuantity as long)),0L),count(v),
                coalesce(sum(case when p.isActive=true and p.available=true and v.available=true and v.stockQuantity < :threshold then 1L else 0L end),0L))
            from Product p left join p.productType c left join p.vendor b left join p.variants v
            left join p.images photo on index(photo)=0
            """+where(f)+" group by p.productID,p.title,photo,c.name,b.name,p.available,p.isActive,p.price order by p.productID "+(f.ascending()?"asc":"desc"),AdminProductRow.class,f)
            .setFirstResult(offset).setMaxResults(size).getResultList();
    }
    public List<com.example.backend.dto.productvariant.ProductVariantResponse> variants(List<Long> ids) {
        if(ids.isEmpty())return List.of();
        return em.createQuery(ProductVariantRepository.RESPONSE_SELECT+" where v.product.productID in :ids order by v.product.productID,v.variantID",com.example.backend.dto.productvariant.ProductVariantResponse.class).setParameter("ids",ids).getResultList();
    }
    public List<com.example.backend.dto.productvariant.ProductVariantResponse> exportVariants(Filter f,int offset,int size) {
        return query(ProductVariantRepository.RESPONSE_SELECT+" join v.product p"+where(f)+" order by p.productID "+(f.ascending()?"asc":"desc")+",v.variantID",com.example.backend.dto.productvariant.ProductVariantResponse.class,f).setFirstResult(offset).setMaxResults(size).getResultList();
    }
    public long exportVariantCount(Filter f) {return query("select count(v) from Product p join p.variants v"+where(f),Long.class,f).getSingleResult();}
    public AdminProductDetail.Options options() {
        String select="select new com.example.backend.dto.product.AdminProductDetail$Lookup(";
        return new AdminProductDetail.Options(em.createQuery(select+"c.productTypeID,c.name,c.isActive) from ProductType c order by c.name",AdminProductDetail.Lookup.class).getResultList(),
            em.createQuery(select+"v.vendorID,v.name,true) from Vendor v order by v.name",AdminProductDetail.Lookup.class).getResultList(),
            em.createQuery(select+"t.tagID,t.name,true) from Tag t order by t.name",AdminProductDetail.Lookup.class).getResultList());
    }
}
