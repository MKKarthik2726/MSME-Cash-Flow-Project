package com.msme.cashflowguard.dto;

import com.msme.cashflowguard.model.StressLevel;
import java.util.List;

/** Response of GET /api/stress/{id} (Stage 9). Score parts: buffer 40 + low-balance days 30 + trend 30. */
public record StressResult(
        int score,
        StressLevel stressLevel,
        int cashBufferScore,
        int lowBalanceDaysScore,
        int balanceTrendScore,
        List<String> reasons,
        double confidence,
        List<String> mainRiskFactors) {
}
