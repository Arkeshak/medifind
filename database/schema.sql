-- ========== PHARMACIES ==========
CREATE TABLE pharmacies (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    address         VARCHAR(255) NOT NULL,
    city            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),
    email           VARCHAR(150),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    owner_user_id   VARCHAR(100),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ========== MEDICINES ==========
CREATE TABLE medicines (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    generic_name    VARCHAR(150) NOT NULL,
    strength        VARCHAR(50),
    form            VARCHAR(50),
    requires_prescription BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (name, strength, form)
);

-- ========== STOCK ==========
CREATE TABLE stock (
    id              SERIAL PRIMARY KEY,
    pharmacy_id     INT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_id     INT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    quantity        INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 10,
    price           DECIMAL(10,2),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (pharmacy_id, medicine_id)
);

-- ========== STOCK EVENTS ==========
CREATE TABLE stock_events (
    id              SERIAL PRIMARY KEY,
    pharmacy_id     INT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_id     INT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    change_qty      INT NOT NULL,
    source          VARCHAR(30) NOT NULL,
    note            VARCHAR(255),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ========== NOTIFICATIONS ==========
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    pharmacy_id     INT REFERENCES pharmacies(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL,
    message         TEXT NOT NULL,
    sent            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ========== INDEXES ==========
CREATE INDEX idx_medicines_name    ON medicines (LOWER(name));
CREATE INDEX idx_medicines_generic ON medicines (LOWER(generic_name));
CREATE INDEX idx_pharmacies_city   ON pharmacies (LOWER(city));
