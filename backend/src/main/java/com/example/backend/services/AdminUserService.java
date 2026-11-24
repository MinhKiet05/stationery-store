package com.example.backend.services;

import com.example.backend.dto.user.*;
import com.example.backend.model.UserRole;
import com.example.backend.repositories.AdminUserRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service @RequiredArgsConstructor @Transactional(readOnly=true) @PreAuthorize("hasRole('ADMIN')")
public class AdminUserService {
    private final AdminUserRepository repository;
    private final EntityManager em;
    public AdminUserFilter filter(AdminUserFilter f) {
        String search=f.search()==null?null:f.search().strip().toLowerCase(Locale.ROOT);
        if(search!=null && search.length()>150)throw error(HttpStatus.BAD_REQUEST,"Tu khoa qua dai");
        if(search!=null && search.isEmpty())search=null;
        return new AdminUserFilter(search,f.role(),f.active(),f.sort()==null?AdminUserFilter.Sort.NEWEST:f.sort());
    }
    public Page<AdminUserRow> list(AdminUserFilter f,int page,int size) {
        if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE)throw error(HttpStatus.BAD_REQUEST,"Phan trang khong hop le");
        f=filter(f);
        return new PageImpl<>(repository.find(f,page*size,size),PageRequest.of(page,size),repository.count(f));
    }
    public AdminUserRepository.Statistics statistics(AdminUserFilter f){return repository.statistics(filter(f));}
    public AdminUserRow detail(Long id){return repository.byId(id).orElseThrow(()->error(HttpStatus.NOT_FOUND,"Khong tim thay tai khoan"));}

    @Transactional
    public AdminUserRow change(Long id,AdminUserChange request){
        if(request==null || request.expectedRole()==null || (request.role()==null)==(request.isActive()==null))throw error(HttpStatus.BAD_REQUEST,"Chi thay doi vai tro hoac trang thai");
        return mutate(id,request,request.isActive());
    }
    /** Keep the original status endpoint/contract, with the same security invariants. */
    @Transactional
    public AdminUserRow legacyStatus(Long id,Boolean active){
        if(active==null)throw error(HttpStatus.BAD_REQUEST,"Thieu trang thai");
        return mutate(id,null,active);
    }
    private AdminUserRow mutate(Long id,AdminUserChange expected,Boolean active){
        // All role/status writers (including the legacy endpoint) lock current ADMIN rows
        // in the same order. The next statements use fresh scalar projections, never a
        // User entity cached by JWT authentication. Cross-demotion cannot remove both admins.
        em.createNativeQuery("select user_id from store.users where role='ADMIN' order by user_id for update",Long.class).getResultList();
        var auth=SecurityContextHolder.getContext().getAuthentication();
        var actor=repository.byUsername(auth.getName()).orElseThrow(()->error(HttpStatus.FORBIDDEN,"Khong co quyen quan tri"));
        if(actor.role()!=UserRole.ADMIN || !Boolean.TRUE.equals(actor.isActive()))throw error(HttpStatus.FORBIDDEN,"Quyen quan tri da thay doi");
        if(em.createNativeQuery("select user_id from store.users where user_id=:id for update",Long.class).setParameter("id",id).getResultList().isEmpty())throw error(HttpStatus.NOT_FOUND,"Khong tim thay tai khoan");
        var current=detail(id);
        if(expected!=null && (expected.expectedRole()!=current.role() || !Objects.equals(expected.expectedActive(),current.isActive())))throw error(HttpStatus.CONFLICT,"Tai khoan da thay doi. Vui long tai lai");
        UserRole role=expected!=null && expected.role()!=null?expected.role():current.role();
        Boolean enabled=active!=null?active:current.isActive();
        boolean removesAdmin=current.role()==UserRole.ADMIN && Boolean.TRUE.equals(current.isActive()) && (role!=UserRole.ADMIN || !Boolean.TRUE.equals(enabled));
        if(actor.userID().equals(id) && (role!=UserRole.ADMIN || !Boolean.TRUE.equals(enabled)))throw error(HttpStatus.CONFLICT,"Khong the tu khoa hoac ha quyen tai khoan");
        if(removesAdmin && em.createQuery("select count(u) from User u where u.role=ADMIN and u.isActive=true",Long.class).getSingleResult()<=1)throw error(HttpStatus.CONFLICT,"Phai giu it nhat mot ADMIN hoat dong");
        // Only these two explicitly allowed columns are written; profile/history untouched.
        em.createQuery("update User u set u.role=:role,u.isActive=:active where u.userID=:id").setParameter("role",role).setParameter("active",enabled).setParameter("id",id).executeUpdate();
        return detail(id);
    }
    private ResponseStatusException error(HttpStatus code,String message){return new ResponseStatusException(code,message);}
}
