package com.msme.cashflowguard.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record UpcomingPaymentRequest(
        @NotBlank(message = "Each upcoming payment needs a name.")
        @Size(max = 60, message = "A payment name can have at most 60 characters.")
        String name,

        @NotNull(message = "Each upcoming payment needs an amount.")
        @DecimalMin(value = "0.01", message = "Each upcoming payment amount must be above 0.")
        @DecimalMax(value = "10000000000", message = "A payment amount is too large.")
        BigDecimal amount,

        LocalDate dueDate) {
}
