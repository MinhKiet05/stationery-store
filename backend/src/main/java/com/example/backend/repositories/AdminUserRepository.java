package com.example.backend.repositories;

import com.example.backend.dto.user.*;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import java.util.*;

@Repository @RequiredArgsConstructor
public class AdminUserRepository {
    private final EntityManager em;
    private static final String SELECT = "select new com.example.backend.dto.user.AdminUserRow(u.userID,u.username,u.fullName,u.email,u.phoneNumber,u.role,u.isActive,u.createdAt) from User u";
    public List<AdminUserRow> find(AdminUserFilter f, int offset, int size) {
        String order = switch (f.sort()) {
            case NEWEST -> "u.createdAt desc, u.userID desc";
            case OLDEST -> "u.createdAt asc, u.userID asc";
            case NAME_ASC -> "lower(coalesce(u.fullName,u.username)) asc, u.userID asc";
        };
        return query(SELECT + where(f) + " order by " + order, AdminUserRow.class, f).setFirstResult(offset).setMaxResults(size).getResultList();
    }
    public long count(AdminUserFilter f) { return query("select count(u) from User u" + where(f), Long.class, f).getSingleResult(); }
    public record Statistics(long totalUsers,long customers,long admins,long lockedUsers) {}
    public Statistics statistics(AdminUserFilter f) {
        var r = query("select count(u),coalesce(sum(case when u.role = CUSTOMER then 1L else 0L end),0L),coalesce(sum(case when u.role = ADMIN then 1L else 0L end),0L),coalesce(sum(case when u.isActive = true then 0L else 1L end),0L) from User u" + where(f),Object[].class,f).getSingleResult();
        return new Statistics(((Number)r[0]).longValue(),((Number)r[1]).longValue(),((Number)r[2]).longValue(),((Number)r[3]).longValue());
    }
    public Optional<AdminUserRow> byId(Long id) { return em.createQuery(SELECT+" where u.userID=:id",AdminUserRow.class).setParameter("id",id).getResultStream().findFirst(); }
    public Optional<AdminUserRow> byUsername(String name) { return em.createQuery(SELECT+" where u.username=:name",AdminUserRow.class).setParameter("name",name).getResultStream().findFirst(); }
    private String where(AdminUserFilter f) {
        String sql=" where 1=1";
        if(f.search()!=null) sql+=" and (lower(coalesce(u.fullName,'')) like :q escape '!' or lower(u.username) like :q escape '!' or lower(u.email) like :q escape '!' or coalesce(u.phoneNumber,'') like :q escape '!' or concat('usr-',cast(u.userID as string)) like :q escape '!')";
        if(f.role()!=null) sql+=" and u.role=:role";
        if(f.active()!=null) sql+=f.active()?" and u.isActive=true":" and (u.isActive=false or u.isActive is null)";
        return sql;
    }
    private <T> TypedQuery<T> query(String sql,Class<T> type,AdminUserFilter f) {
        var q=em.createQuery(sql,type);
        if(f.search()!=null)q.setParameter("q","%"+f.search().replace("!","!!").replace("%","!%").replace("_","!_")+"%");
        if(f.role()!=null)q.setParameter("role",f.role());
        return q;
    }
}
