package com.mototaxi.dto;

import com.mototaxi.model.Driver;
import com.mototaxi.model.Ride;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RideResponse {

    private Long id;
    private String driverName;
    private String driverPhone;
    private String driverPlate;
    private Double driverRating;
    private String customerName;
    private String customerPhone;
    private String originAddress;
    private Double originLat;
    private Double originLng;
    private String destAddress;
    private Double destLat;
    private Double destLng;
    private Double estimatedPrice;
    private Double finalPrice;
    private Driver.VehicleType vehicleType;
    private Ride.RideStatus status;
    private LocalDateTime requestedAt;
}

