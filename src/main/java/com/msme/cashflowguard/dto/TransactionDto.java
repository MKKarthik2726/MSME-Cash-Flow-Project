package com.msme.cashflowguard.dto;

import com.msme.cashflowguard.entity.Transaction;
import java.math.BigDecimal;
import java.time.LocalDate;

/** One transaction as the frontend sees it. A zero debit/credit is sent as null so the table shows a dash. */
public record TransactionDto(
        LocalDate date,
        String description,
        BigDecimal debit,
        BigDecimal credit,
        BigDecimal balance,
        String category,
        Double classificationConfidence,
        String classificationReason,
        boolean recurring) {

    public static TransactionDto from(Transaction t) {
        return new TransactionDto(
                t.getTxnDate(),
                t.getDescription(),
                t.isDebit() ? t.getDebit() : null,
                t.isCredit() ? t.getCredit() : null,
                t.getBalance(),
                t.getCategory() == null ? null : t.getCategory().name(),
                t.getClassificationConfidence(),
                t.getClassificationReason(),
                t.isRecurring());
    }
}
