package com.example.backend.ai;

import java.util.*;

public interface CatalogAi {
    Map<Long, Double> search(String query, int limit);
    List<Long> select(String question, List<CatalogProduct> candidates);
    boolean synchronize(CatalogProduct product);
}
