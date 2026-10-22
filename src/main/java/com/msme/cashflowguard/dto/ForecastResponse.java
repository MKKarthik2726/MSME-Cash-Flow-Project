package com.msme.cashflowguard.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Response of GET /api/forecast/{id} (Stage 8). Never just one unexplained number. */
public record ForecastResponse(
        Long statementId,
        LocalDate startDate,
        LocalDate endDate,
        BigDecimal openingBalance,
        BigDecimal shortageThreshold,
        List<ForecastDay> days,
        BigDecimal minimumExpectedBalance,
        LocalDate minimumExpectedBalanceDate,
        BigDecimal minimumConservativeBalance,
        int shortageRiskDays,
        double confidence,
        List<String> assumptions) {
}
