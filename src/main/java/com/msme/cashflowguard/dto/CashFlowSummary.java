package com.msme.cashflowguard.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Response of GET /api/dashboard/{id} (Stage 6). */
public record CashFlowSummary(
        Long statementId,
        String filename,
        LocalDateTime uploadedAt,
        LocalDate firstTransactionDate,
        LocalDate latestTransactionDate,
        long historyDays,
        BigDecimal latestBalance,
        BigDecimal totalInflows,
        BigDecimal totalOutflows,
        BigDecimal netCashFlow,
        BigDecimal averageBalance,
        BigDecimal minimumBalance,
        BigDecimal maximumBalance,
        BigDecimal averageDailyOutflow,
        BigDecimal lowBalanceThreshold,
        int lowBalanceDays,
        List<MonthlyTotal> monthlyTotals,
        List<CustomerInflow> topCustomerInflows,
        List<CategoryTotal> topExpenseCategories,
        List<RecurringTransactionDto> recurringTransactions) {
}
