package com.msme.cashflowguard.dto;

import java.math.BigDecimal;

public record CustomerInflow(String customerName, BigDecimal amount, int paymentCount) {
}
