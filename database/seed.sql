INSERT INTO pharmacies (name, address, city, phone, email, latitude, longitude) VALUES
('City Care Pharmacy', '12 Main Street', 'Colombo', '0112345678', 'citycare@example.com', 6.9271, 79.8612),
('HealthPlus Pharmacy', '45 Beach Road', 'Negombo', '0312233445', 'healthplus@example.com', 7.2083, 79.8358),
('MediLife Pharmacy', '78 Kandy Road', 'Kandy', '0812233445', 'medilife@example.com', 7.2906, 80.6337);

INSERT INTO medicines (name, generic_name, strength, form, requires_prescription) VALUES
('Panadol', 'acetaminophen', '500mg', 'tablet', FALSE),
('Amoxil', 'amoxicillin', '250mg', 'capsule', TRUE),
('Glucophage', 'metformin', '500mg', 'tablet', TRUE),
('Piriton', 'chlorpheniramine', '4mg', 'tablet', FALSE),
('Ventolin', 'albuterol', '100mcg', 'inhaler', TRUE);

INSERT INTO stock (pharmacy_id, medicine_id, quantity, low_stock_threshold, price) VALUES
(1, 1, 200, 20, 5.00),
(1, 2, 8,   10, 45.00),   -- low stock (for testing alerts)
(1, 3, 0,   10, 12.00),   -- out of stock
(2, 1, 150, 20, 5.00),
(2, 4, 60,  10, 3.50),
(3, 5, 5,   5,  850.00),  -- at the threshold
(3, 2, 40,  10, 45.00);
