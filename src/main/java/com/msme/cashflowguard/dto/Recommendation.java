package com.msme.cashflowguard.dto;

import com.msme.cashflowguard.model.Priority;

/** One practical cash-management suggestion (never legal, lending, tax or investment advice). */
public record Recommendation(
        String title,
        Priority priority,
        String explanation,
        String reason,
        String suggestedAction) {
}
