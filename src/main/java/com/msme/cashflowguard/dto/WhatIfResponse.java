package com.msme.cashflowguard.dto;

import com.msme.cashflowguard.model.StressLevel;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Response of POST /api/simulation (Stage 10). */
public record WhatIfResponse(
        String customerName,
        int delayDays,
        BigDecimal paymentAmount,
        LocalDate originalPaymentDate,
        LocalDate simulatedPaymentDate,
        BigDecimal normalMinimumBalance,
        BigDecimal simulatedMinimumBalance,
        int normalShortageDays,
        int shortageDays,
        StressLevel normalStressLevel,
        StressLevel simulatedStressLevel,
        int normalStressScore,
        int simulatedStressScore,
        String dateBasis,
        String recommendation) {
}
