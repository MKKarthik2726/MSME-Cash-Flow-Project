package com.msme.cashflowguard.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One forecast day. Projected Balance = Previous Balance + Expected Inflows - Expected Outflows. */
public record ForecastDay(
        LocalDate date,
        BigDecimal expectedInflows,
        BigDecimal expectedOutflows,
        BigDecimal conservativeBalance,
        BigDecimal expectedBalance,
        BigDecimal optimisticBalance,
        boolean shortageRisk) {
}
