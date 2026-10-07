CREATE TABLE IF NOT EXISTS supplier_deliveries (
    delivery_id   VARCHAR(100) PRIMARY KEY,
    supplier      VARCHAR(150) NOT NULL,
    pharmacy_id   INT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    item_count    INT NOT NULL,
    received_at   TIMESTAMP DEFAULT NOW()
);
