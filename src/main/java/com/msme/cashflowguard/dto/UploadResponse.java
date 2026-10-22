package com.msme.cashflowguard.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Response of POST /api/statements/upload. Field names match what the frontend reads. */
public record UploadResponse(
        Long statementId,
        String filename,
        LocalDateTime uploadedAt,
        String message,
        int totalRows,
        int validRows,
        int invalidRows,
        int duplicateRows,
        List<String> warnings,
        int dataQualityScore,
        String qualityNote,
        LocalDate firstTransactionDate,
        LocalDate latestTransactionDate,
        BigDecimal latestBalance,
        List<TransactionDto> preview,
        List<String> customers) {
}
