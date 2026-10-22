package com.msme.cashflowguard.dto;

import com.msme.cashflowguard.entity.RecurringTransaction;
import java.math.BigDecimal;
import java.time.LocalDate;

public record RecurringTransactionDto(
        String description,
        String category,
        String direction,
        String frequency,
        BigDecimal averageAmount,
        LocalDate lastOccurrenceDate,
        LocalDate expectedDate,
        int occurrenceCount,
        double confidence) {

    /** {@code asOf} rolls the expected date forward so it is never in the past. */
    public static RecurringTransactionDto from(RecurringTransaction r, LocalDate asOf) {
        LocalDate expected = r.getFrequency().nextOnOrAfter(r.getLastOccurrenceDate(), asOf);
        return new RecurringTransactionDto(
                r.getDescription(),
                r.getCategory().name(),
                r.getDirection().name(),
                r.getFrequency().getLabel(),
                r.getAverageAmount(),
                r.getLastOccurrenceDate(),
                expected,
                r.getOccurrenceCount(),
                r.getConfidence());
    }
}
