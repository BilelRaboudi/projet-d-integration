package com.mototaxi;

import com.mototaxi.model.Driver;
import com.mototaxi.model.Tariff;
import com.mototaxi.model.User;
import com.mototaxi.repository.DriverRepository;
import com.mototaxi.repository.TariffRepository;
import com.mototaxi.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Initialisation des donnees de base pour le projet MotoTaxi TN
 * Exactement 5 utilisateurs (1 Admin, 2 Clients, 2 Chauffeurs)
 */
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final DriverRepository driverRepository;
    private final TariffRepository tariffRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        // 1. Initialiser les tarifs officiels MotoTaxi
        initTariffs();

        // 2. Administrateur (ID 1)
        User adminUser = userRepository.findByEmail("admin@mototaxi.tn").orElseGet(() ->
                userRepository.save(User.builder()
                        .firstName("Admin")
                        .lastName("MotoTaxi")
                        .email("admin@mototaxi.tn")
                        .phone("+216 71 000 000")
                        .role(User.Role.ADMIN)
                        .build())
        );
        adminUser.setPasswordHash(passwordEncoder.encode("Admin@123"));
        userRepository.save(adminUser);

        // 3. Client 1 : Sami Ben Salah (ID 2)
        User samiUser = userRepository.findByEmail("client@mototaxi.tn").orElseGet(() ->
                userRepository.save(User.builder()
                        .firstName("Sami")
                        .lastName("Ben Salah")
                        .email("client@mototaxi.tn")
                        .phone("+216 98 123 456")
                        .role(User.Role.CUSTOMER)
                        .build())
        );
        samiUser.setPasswordHash(passwordEncoder.encode("Client@123"));
        userRepository.save(samiUser);

        // 4. Client 2 : Yasmine Dridi (ID 3)
        User yasmineUser = userRepository.findByEmail("yasmine@mototaxi.tn").orElseGet(() ->
                userRepository.save(User.builder()
                        .firstName("Yasmine")
                        .lastName("Dridi")
                        .email("yasmine@mototaxi.tn")
                        .phone("+216 22 345 678")
                        .role(User.Role.CUSTOMER)
                        .build())
        );
        yasmineUser.setPasswordHash(passwordEncoder.encode("Client@123"));
        userRepository.save(yasmineUser);

        // 5. Chauffeur 1 : Amine Jlassi - Moto (ID 5)
        User amineUser = userRepository.findByEmail("driver@mototaxi.tn").orElseGet(() ->
                userRepository.save(User.builder()
                        .firstName("Amine")
                        .lastName("Jlassi")
                        .email("driver@mototaxi.tn")
                        .phone("+216 94 111 222")
                        .role(User.Role.DRIVER)
                        .build())
        );
        amineUser.setPasswordHash(passwordEncoder.encode("Driver@123"));
        userRepository.save(amineUser);

        if (driverRepository.findByUserId(amineUser.getId()).isEmpty()) {
            driverRepository.save(Driver.builder()
                    .user(amineUser)
                    .licenseNumber("PERM-77889")
                    .vehicleType(Driver.VehicleType.MOTO)
                    .vehiclePlate("178 TU 3144")
                    .isAvailable(true)
                    .status(Driver.DriverStatus.VALIDATED)
                    .currentLat(36.8180)
                    .currentLng(10.1750)
                    .totalEarnings(87.5)
                    .build());
        }

        // 6. Chauffeur 2 : Mohamed Ben Ali - Taxi (ID 6)
        User mohamedUser = userRepository.findByEmail("mohamed@mototaxi.tn").orElseGet(() ->
                userRepository.save(User.builder()
                        .firstName("Mohamed")
                        .lastName("Ben Ali")
                        .email("mohamed@mototaxi.tn")
                        .phone("+216 98 123 456")
                        .role(User.Role.DRIVER)
                        .build())
        );
        mohamedUser.setPasswordHash(passwordEncoder.encode("Driver@123"));
        userRepository.save(mohamedUser);

        if (driverRepository.findByUserId(mohamedUser.getId()).isEmpty()) {
            driverRepository.save(Driver.builder()
                    .user(mohamedUser)
                    .licenseNumber("PERM-99123")
                    .vehicleType(Driver.VehicleType.TAXI)
                    .vehiclePlate("145 TU 8892")
                    .isAvailable(true)
                    .status(Driver.DriverStatus.VALIDATED)
                    .currentLat(36.8000)
                    .currentLng(10.1800)
                    .totalEarnings(112.0)
                    .build());
        }

        System.out.println(">>> MotoTaxi Data Initializer: Base de donnees prete avec 5 utilisateurs reels.");
    }

    private void initTariffs() {
        if (tariffRepository.findByVehicleType(Driver.VehicleType.MOTO).isEmpty()) {
            tariffRepository.save(Tariff.builder()
                    .vehicleType(Driver.VehicleType.MOTO)
                    .basePrice(2.0)
                    .pricePerKm(0.8)
                    .build());
        }

        if (tariffRepository.findByVehicleType(Driver.VehicleType.TAXI).isEmpty()) {
            tariffRepository.save(Tariff.builder()
                    .vehicleType(Driver.VehicleType.TAXI)
                    .basePrice(3.5)
                    .pricePerKm(1.2)
                    .build());
        }

        if (tariffRepository.findByVehicleType(Driver.VehicleType.EXPRESS).isEmpty()) {
            tariffRepository.save(Tariff.builder()
                    .vehicleType(Driver.VehicleType.EXPRESS)
                    .basePrice(5.0)
                    .pricePerKm(1.8)
                    .build());
        }
    }
}
