package com.msme.cashflowguard.dto;

import java.math.BigDecimal;

public record CategoryTotal(String category, BigDecimal amount, int transactionCount) {
}
