package com.msme.cashflowguard.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/** Body of POST /api/simulation. The delay may be ANY whole number from 1 to 30. */
public record WhatIfRequest(
        Long statementId,

        @NotBlank(message = "Please select a customer.")
        @Size(max = 255, message = "Customer name is too long.")
        String customerName,

        @NotNull(message = "Delay must be a whole number from 1 to 30.")
        @Min(value = 1, message = "Delay must be a whole number from 1 to 30.")
        @Max(value = 30, message = "Delay must be a whole number from 1 to 30.")
        Integer delayDays,

        @NotNull(message = "Enter a payment amount greater than zero.")
        @DecimalMin(value = "0.01", message = "Enter a payment amount greater than zero.")
        @DecimalMax(value = "10000000000", message = "The payment amount is too large.")
        BigDecimal paymentAmount) {
}
