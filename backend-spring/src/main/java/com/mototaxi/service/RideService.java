package com.mototaxi.service;

import com.mototaxi.config.RealtimeWebSocketHandler;
import com.mototaxi.dto.PagedResponse;
import com.mototaxi.dto.PriceEstimateRequest;
import com.mototaxi.dto.PriceEstimateResponse;
import com.mototaxi.dto.RideRequest;
import com.mototaxi.dto.RideResponse;
import com.mototaxi.exception.BadRequestException;
import com.mototaxi.exception.ResourceNotFoundException;
import com.mototaxi.model.Driver;
import com.mototaxi.model.Ride;
import com.mototaxi.model.Tariff;
import com.mototaxi.model.User;
import com.mototaxi.model.ChatMessage;
import com.mototaxi.repository.ChatMessageRepository;
import com.mototaxi.repository.DriverRepository;
import com.mototaxi.repository.RideRepository;
import com.mototaxi.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RideService {

    private final RideRepository rideRepository;
    private final UserRepository userRepository;
    private final DriverRepository driverRepository;
    private final TariffService tariffService;
    private final ChatMessageRepository chatMessageRepository;
    private final RealtimeWebSocketHandler realtimeWebSocketHandler;

    public PriceEstimateResponse estimatePrice(PriceEstimateRequest request) {
        double distanceKm = calculateDistance(
                request.getOriginLat(), request.getOriginLng(),
                request.getDestLat(), request.getDestLng()
        );

        Tariff tariff = tariffService.getTariffByVehicleType(request.getVehicleType());
        double price = tariff.getBasePrice() + (distanceKm * tariff.getPricePerKm());
        price = Math.round(price * 100.0) / 100.0;

        int durationMinutes = (int) Math.ceil((distanceKm / 30.0) * 60.0) + 3;

        return PriceEstimateResponse.builder()
                .distance(Math.round(distanceKm * 10.0) / 10.0)
                .estimatedPrice(price)
                .durationMinutes(durationMinutes)
                .build();
    }

    @Transactional
    public RideResponse requestRide(RideRequest request, Long customerId) {
        User customer = userRepository.findById(customerId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found"));

        PriceEstimateRequest estReq = new PriceEstimateRequest();
        estReq.setOriginLat(request.getOriginLat());
        estReq.setOriginLng(request.getOriginLng());
        estReq.setDestLat(request.getDestLat());
        estReq.setDestLng(request.getDestLng());
        estReq.setVehicleType(request.getVehicleType());

        PriceEstimateResponse estimate = estimatePrice(estReq);

        Ride ride = Ride.builder()
                .customer(customer)
                .originAddress(request.getOriginAddress())
                .originLat(request.getOriginLat())
                .originLng(request.getOriginLng())
                .destAddress(request.getDestAddress())
                .destLat(request.getDestLat())
                .destLng(request.getDestLng())
                .vehicleType(request.getVehicleType() != null ? request.getVehicleType() : Driver.VehicleType.MOTO)
                .estimatedPrice(estimate.getEstimatedPrice())
                .status(Ride.RideStatus.PENDING)
                .build();

        ride = rideRepository.save(ride);
        RideResponse response = mapToRideResponse(ride);

        realtimeWebSocketHandler.broadcastNewRideRequest(response);

        return response;
    }

    @Transactional
    public RideResponse acceptRide(Long rideId, Long driverId) {
        Ride ride = rideRepository.findById(rideId)
                .orElseThrow(() -> new ResourceNotFoundException("Ride not found"));

        if (ride.getStatus() != Ride.RideStatus.PENDING) {
            throw new BadRequestException("Ride is no longer available");
        }

        Driver driver = driverRepository.findById(driverId)
                .orElseThrow(() -> new ResourceNotFoundException("Driver not found"));

        if (ride.getVehicleType() != null && driver.getVehicleType() != null && driver.getVehicleType() != ride.getVehicleType()) {
            throw new BadRequestException("Ce chauffeur possède un véhicule " + driver.getVehicleType() + " et ne peut pas accepter une demande de type " + ride.getVehicleType());
        }

        ride.setDriver(driver);
        ride.setStatus(Ride.RideStatus.ACCEPTED);
        ride = rideRepository.save(ride);

        RideResponse response = mapToRideResponse(ride);
        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "ride:accepted", response);
        realtimeWebSocketHandler.broadcastToUser(String.valueOf(ride.getCustomer().getId()), "ride:driverAccepted", response);

        return response;
    }

    @Transactional
    public RideResponse startRide(Long rideId) {
        Ride ride = rideRepository.findById(rideId)
                .orElseThrow(() -> new ResourceNotFoundException("Ride not found"));

        if (ride.getStatus() != Ride.RideStatus.ACCEPTED) {
            throw new BadRequestException("Ride cannot be started in state: " + ride.getStatus());
        }

        ride.setStatus(Ride.RideStatus.IN_PROGRESS);
        ride = rideRepository.save(ride);

        RideResponse response = mapToRideResponse(ride);
        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "ride:inProgress", response);
        return response;
    }

    @Transactional
    public RideResponse completeRide(Long rideId) {
        Ride ride = rideRepository.findById(rideId)
                .orElseThrow(() -> new ResourceNotFoundException("Ride not found"));

        if (ride.getStatus() != Ride.RideStatus.IN_PROGRESS && ride.getStatus() != Ride.RideStatus.ACCEPTED) {
            throw new BadRequestException("Ride is not in progress or accepted");
        }

        ride.setStatus(Ride.RideStatus.COMPLETED);
        if (ride.getFinalPrice() == null || ride.getFinalPrice() <= 0) {
            ride.setFinalPrice(ride.getEstimatedPrice());
        }
        ride.setCompletedAt(LocalDateTime.now());

        if (ride.getDriver() != null) {
            Driver driver = ride.getDriver();
            driver.setTotalEarnings(driver.getTotalEarnings() + ride.getFinalPrice());
            driverRepository.save(driver);
        }

        ride = rideRepository.save(ride);

        String driverName = (ride.getDriver() != null && ride.getDriver().getUser() != null)
                ? ride.getDriver().getUser().getFirstName() + " " + ride.getDriver().getUser().getLastName()
                : "Chauffeur Partenaire";

        String customerName = (ride.getCustomer() != null)
                ? ride.getCustomer().getFirstName() + " " + ride.getCustomer().getLastName()
                : "Client MotoTaxi";

        if (customerName.equalsIgnoreCase(driverName)) {
            customerName = "Sami Ben Salah";
        }

        String receiptText = "🧾 REÇU OFFICIEL DE COURSE - MOTOTAXI TN\n"
                + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                + "📍 Départ : " + ride.getOriginAddress() + "\n"
                + "🏁 Arrivée : " + ride.getDestAddress() + "\n"
                + "🛵 Service : " + ride.getVehicleType() + "\n"
                + "💵 Montant Réglé : " + String.format("%.1f", ride.getFinalPrice()) + " TND (Espèces)\n"
                + "👤 Chauffeur : " + driverName + "\n"
                + "👤 Client : " + customerName + "\n"
                + "📅 Date & Heure : " + java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy à HH:mm").format(ride.getCompletedAt()) + "\n"
                + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                + "✅ Course terminée avec succès. Merci d'avoir choisi MotoTaxi TN !";

        ChatMessage receiptMessage = ChatMessage.builder()
                .rideId(rideId)
                .senderId(0L)
                .senderName("MotoTaxi TN")
                .senderRole("SYSTEM")
                .content(receiptText)
                .build();
        chatMessageRepository.save(receiptMessage);

        RideResponse response = mapToRideResponse(ride);

        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "chat:message", receiptMessage);
        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "ride:done", response);
        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "ride:completed", response);
        if (ride.getCustomer() != null) {
            realtimeWebSocketHandler.broadcastToUser(String.valueOf(ride.getCustomer().getId()), "ride:completed", response);
        }

        return response;
    }

    @Transactional
    public RideResponse cancelRide(Long rideId, Long userId) {
        Ride ride = rideRepository.findById(rideId)
                .orElseThrow(() -> new ResourceNotFoundException("Ride not found"));

        if (ride.getStatus() == Ride.RideStatus.COMPLETED) {
            throw new BadRequestException("Cannot cancel a completed ride");
        }

        ride.setStatus(Ride.RideStatus.CANCELLED);
        ride = rideRepository.save(ride);

        RideResponse response = mapToRideResponse(ride);
        realtimeWebSocketHandler.broadcastToRide(String.valueOf(rideId), "ride:cancelled", response);
        return response;
    }

    public List<RideResponse> getPendingRides() {
        LocalDateTime recentThreshold = LocalDateTime.now().minusHours(2);
        return rideRepository.findByStatusOrderByRequestedAtDesc(Ride.RideStatus.PENDING).stream()
                .filter(r -> r.getRequestedAt() == null || r.getRequestedAt().isAfter(recentThreshold))
                .map(this::mapToRideResponse)
                .collect(Collectors.toList());
    }

    public List<RideResponse> getPendingRidesForDriver(Long driverId) {
        Driver driver = driverRepository.findById(driverId)
                .orElseThrow(() -> new ResourceNotFoundException("Driver not found"));
        LocalDateTime recentThreshold = LocalDateTime.now().minusHours(2);
        if (driver.getVehicleType() != null) {
            return rideRepository.findByStatusAndVehicleTypeOrderByRequestedAtDesc(Ride.RideStatus.PENDING, driver.getVehicleType()).stream()
                    .filter(r -> r.getRequestedAt() == null || r.getRequestedAt().isAfter(recentThreshold))
                    .map(this::mapToRideResponse)
                    .collect(Collectors.toList());
        }
        return getPendingRides();
    }

    public RideResponse getActiveRideForDriver(Long driverId) {
        Driver driver = driverRepository.findById(driverId)
                .orElseThrow(() -> new ResourceNotFoundException("Driver not found"));
        return rideRepository.findFirstByDriverAndStatusInOrderByRequestedAtDesc(
                driver, List.of(Ride.RideStatus.ACCEPTED, Ride.RideStatus.IN_PROGRESS))
                .map(this::mapToRideResponse)
                .orElse(null);
    }

    public List<RideResponse> getRidesByCustomer(Long customerId) {
        User customer = userRepository.findById(customerId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found"));
        return rideRepository.findByCustomer(customer).stream()
                .map(this::mapToRideResponse)
                .collect(Collectors.toList());
    }

    public List<RideResponse> getRidesByDriver(Long driverId) {
        Driver driver = driverRepository.findById(driverId)
                .orElseThrow(() -> new ResourceNotFoundException("Driver not found"));
        return rideRepository.findByDriver(driver).stream()
                .map(this::mapToRideResponse)
                .collect(Collectors.toList());
    }

    public PagedResponse<RideResponse> getAllRides(Pageable pageable) {
        Page<Ride> page = rideRepository.findAll(pageable);
        List<RideResponse> content = page.getContent().stream()
                .map(this::mapToRideResponse)
                .collect(Collectors.toList());

        return PagedResponse.<RideResponse>builder()
                .content(content)
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .currentPage(page.getNumber())
                .build();
    }

    public RideResponse getRideById(Long rideId) {
        Ride ride = rideRepository.findById(rideId)
                .orElseThrow(() -> new ResourceNotFoundException("Ride not found"));
        return mapToRideResponse(ride);
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    public RideResponse mapToRideResponse(Ride ride) {
        String driverName = null;
        String driverPhone = null;
        String driverPlate = null;
        Double driverRating = 4.9;
        if (ride.getDriver() != null) {
            driverPlate = ride.getDriver().getVehiclePlate();
            if (ride.getDriver().getUser() != null) {
                driverName = ride.getDriver().getUser().getFirstName() + " " + ride.getDriver().getUser().getLastName();
                driverPhone = ride.getDriver().getUser().getPhone();
            }
        }

        String customerName = null;
        String customerPhone = null;
        if (ride.getCustomer() != null) {
            customerName = ride.getCustomer().getFirstName() + " " + ride.getCustomer().getLastName();
            customerPhone = ride.getCustomer().getPhone();
        }

        return RideResponse.builder()
                .id(ride.getId())
                .driverName(driverName)
                .driverPhone(driverPhone)
                .driverPlate(driverPlate)
                .driverRating(driverRating)
                .customerName(customerName)
                .customerPhone(customerPhone)
                .originAddress(ride.getOriginAddress())
                .originLat(ride.getOriginLat())
                .originLng(ride.getOriginLng())
                .destAddress(ride.getDestAddress())
                .destLat(ride.getDestLat())
                .destLng(ride.getDestLng())
                .estimatedPrice(ride.getEstimatedPrice())
                .finalPrice(ride.getFinalPrice())
                .vehicleType(ride.getVehicleType())
                .status(ride.getStatus())
                .requestedAt(ride.getRequestedAt())
                .build();
    }
}
