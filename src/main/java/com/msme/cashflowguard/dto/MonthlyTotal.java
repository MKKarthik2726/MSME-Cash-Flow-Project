package com.msme.cashflowguard.dto;

import java.math.BigDecimal;

public record MonthlyTotal(String month, BigDecimal inflow, BigDecimal outflow, BigDecimal net) {
}
