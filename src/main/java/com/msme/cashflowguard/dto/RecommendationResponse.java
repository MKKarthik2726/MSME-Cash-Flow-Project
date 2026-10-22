package com.msme.cashflowguard.dto;

import java.util.List;

public record RecommendationResponse(List<Recommendation> recommendations, String disclaimer) {

    public static final String DISCLAIMER =
            "Practical cash-management suggestions only. Not legal, lending, tax or investment advice.";
}
