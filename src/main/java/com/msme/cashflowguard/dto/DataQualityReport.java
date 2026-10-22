package com.msme.cashflowguard.dto;

import java.util.List;

/** Result of validating an uploaded CSV (Stage 4). This is NOT a fraud check. */
public record DataQualityReport(
        int totalRows,
        int validRows,
        int invalidRows,
        int duplicateRows,
        int balanceMismatchRows,
        long historyDays,
        List<String> warnings,
        int qualityScore,
        String note) {

    public static final String NOTE = "Review recommended; this is not a fraud determination.";
}
