DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- 1. TIPOS ENUMERADOS
CREATE TYPE rol_usuario AS ENUM ('cliente', 'tecnico', 'administrador');

CREATE TYPE estado_ticket AS ENUM (
    'registrado',
    'en_revision',
    'en_diagnostico',
    'esperando_repuesto',
    'resuelto',
    'entregado'
);

CREATE TYPE tipo_evidencia AS ENUM ('foto', 'comprobante');

-- 2. TABLA USUARIOS
CREATE TABLE usuarios (
    id              BIGSERIAL PRIMARY KEY,
    rol             rol_usuario NOT NULL,
    nombres         VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(100) NOT NULL,
    dni             VARCHAR(20)  NOT NULL UNIQUE,
    correo          VARCHAR(150) NOT NULL UNIQUE,
    celular         VARCHAR(20),
    password_hash   VARCHAR(255) NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_rol ON usuarios (rol);

-- 3. TABLA PRODUCTOS
CREATE TABLE productos (
    id           BIGSERIAL PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL,
    categoria    VARCHAR(80)  NOT NULL,
    modelo       VARCHAR(80),
    descripcion  TEXT,
    activo       BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. TABLA TICKETS
CREATE TABLE tickets (
    id                   BIGSERIAL PRIMARY KEY,
    codigo               VARCHAR(20) NOT NULL UNIQUE,
    cliente_id           BIGINT NOT NULL REFERENCES usuarios(id),
    producto_id          BIGINT NOT NULL REFERENCES productos(id),
    tecnico_id           BIGINT REFERENCES usuarios(id),
    numero_serie         VARCHAR(50),
    fecha_compra         DATE,
    descripcion_falla    TEXT NOT NULL,
    estado               estado_ticket NOT NULL DEFAULT 'registrado',
    fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_cliente  ON tickets (cliente_id);
CREATE INDEX idx_tickets_tecnico  ON tickets (tecnico_id);
CREATE INDEX idx_tickets_estado   ON tickets (estado);

CREATE OR REPLACE FUNCTION fn_validar_roles_ticket() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT rol FROM usuarios WHERE id = NEW.cliente_id) <> 'cliente' THEN
        RAISE EXCEPTION 'cliente_id (%) debe tener rol cliente', NEW.cliente_id;
    END IF;
    IF NEW.tecnico_id IS NOT NULL
       AND (SELECT rol FROM usuarios WHERE id = NEW.tecnico_id) <> 'tecnico' THEN
        RAISE EXCEPTION 'tecnico_id (%) debe tener rol tecnico', NEW.tecnico_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_roles_ticket
    BEFORE INSERT OR UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_validar_roles_ticket();

-- 5. TABLA EVIDENCIAS
CREATE TABLE evidencias (
    id            BIGSERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tipo          tipo_evidencia NOT NULL,
    url_archivo   TEXT NOT NULL,
    fecha_subida  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidencias_ticket ON evidencias (ticket_id);

-- 6. TABLA DIAGNÓSTICOS
CREATE TABLE diagnosticos (
    id                  BIGSERIAL PRIMARY KEY,
    ticket_id           BIGINT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    tecnico_id          BIGINT NOT NULL REFERENCES usuarios(id),
    hallazgos           TEXT NOT NULL,
    aplica_garantia     BOOLEAN NOT NULL,
    costo_estimado      NUMERIC(10,2),
    solucion_aplicada   TEXT,
    fecha_diagnostico   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_costo_garantia CHECK (
        (aplica_garantia = TRUE  AND costo_estimado IS NULL) OR
        (aplica_garantia = FALSE AND costo_estimado IS NOT NULL)
    )
);

-- 7. TABLA HISTORIAL DE ESTADOS
CREATE TABLE historial_estados (
    id               BIGSERIAL PRIMARY KEY,
    ticket_id        BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    estado_anterior  estado_ticket,
    estado_nuevo     estado_ticket NOT NULL,
    usuario_id       BIGINT REFERENCES usuarios(id),
    fecha_cambio     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_ticket ON historial_estados (ticket_id);

-- 8. TABLA NOTIFICACIONES
CREATE TABLE notificaciones (
    id           BIGSERIAL PRIMARY KEY,
    usuario_id   BIGINT NOT NULL REFERENCES usuarios(id),
    ticket_id    BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    mensaje      TEXT NOT NULL,
    leido        BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_envio  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_usuario ON notificaciones (usuario_id, leido);

-- 9. TRIGGERS AUTOMÁTICOS
CREATE OR REPLACE FUNCTION fn_tickets_cambio_estado() RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion := now();

    IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo, usuario_id)
        VALUES (NEW.id, OLD.estado, NEW.estado, NEW.tecnico_id);

        INSERT INTO notificaciones (usuario_id, ticket_id, mensaje)
        VALUES (
            NEW.cliente_id,
            NEW.id,
            'Tu ticket ' || NEW.codigo || ' cambió de estado a: ' || NEW.estado
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_cambio_estado
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_tickets_cambio_estado();

CREATE OR REPLACE FUNCTION fn_tickets_estado_inicial() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo, usuario_id)
    VALUES (NEW.id, NULL, NEW.estado, NEW.cliente_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_estado_inicial
    AFTER INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_tickets_estado_inicial();

-- 10. DATOS DE PRUEBA
-- Contraseñas de prueba (bcrypt, coste 12): clientes = cliente123, técnicos = tecnico123, administrador = admin123
INSERT INTO usuarios (rol, nombres, apellidos, dni, correo, celular, password_hash) VALUES
('cliente',       'Lucía',   'Ramos',   '71234567', 'lucia.ramos@mail.com',    '987654321', '$2b$12$F43rjJifcIW5.r10l22sruEFNkIQBovnwgOTgVqa0nqW8OGwQLvZy'),
('tecnico',       'Marco',   'Delgado', '72345678', 'marco.delgado@sony.com',  '987654322', '$2b$12$bl9LOBd62TFjonw36YjVH.rjB8Pi6UV6JjQ.zcjBhoO2.RwTiBiO2'),
('administrador', 'Paula',   'Núñez',   '73456789', 'paula.nunez@sony.com',    '987654323', '$2b$12$boeqZnVylOIWTwFTp3y6b.fSprJkN4ayXl6dgvRipKvBlre/O91dO'),
('cliente',       'Carlos',  'Mendoza', '74561234', 'carlos.mendoza@gmail.com','951234567', '$2b$12$F43rjJifcIW5.r10l22sruEFNkIQBovnwgOTgVqa0nqW8OGwQLvZy'),
('tecnico',       'Jorge',   'Campos',  '73112233', 'jorge.campos@sony.com',   '945678123', '$2b$12$bl9LOBd62TFjonw36YjVH.rjB8Pi6UV6JjQ.zcjBhoO2.RwTiBiO2');

INSERT INTO productos (nombre, categoria, modelo, descripcion) VALUES
('PlayStation 5 Slim',         'Consola',     'CFI-2016A',   'Consola de videojuegos PS5'),
('Televisor Bravia XR 55"',    'Televisores', 'XR-55A80L',   'Smart TV OLED 4K'),
('Audífonos WH-1000XM5',       'Audio',       'WH-1000XM5',  'Audífonos inalámbricos Noise Cancelling'),
('Cámara Alpha 7 IV',          'Cámaras',     'ILCE-7M4',    'Cámara fotográfica profesional');

INSERT INTO tickets (codigo, cliente_id, producto_id, numero_serie, fecha_compra, descripcion_falla, estado)
VALUES (
    'TCK-2026-0001',
    (SELECT id FROM usuarios WHERE correo = 'lucia.ramos@mail.com'),
    (SELECT id FROM productos WHERE modelo = 'CFI-2016A'),
    'SN-PS5-984321',
    '2025-12-15',
    'La consola se apaga sola a los 10 minutos de juego.',
    'registrado'
);

INSERT INTO tickets (codigo, cliente_id, producto_id, tecnico_id, numero_serie, fecha_compra, descripcion_falla, estado)
VALUES (
    'TCK-2026-0002',
    (SELECT id FROM usuarios WHERE correo = 'carlos.mendoza@gmail.com'),
    (SELECT id FROM productos WHERE modelo = 'ILCE-7M4'),
    (SELECT id FROM usuarios WHERE correo = 'marco.delgado@sony.com'),
    'SN-CAM-789012',
    '2025-11-20',
    'El sensor presenta manchas internas y no enfoca correctamente.',
    'en_revision'
);

INSERT INTO evidencias (ticket_id, tipo, url_archivo) VALUES
(1, 'foto',        'https://storage.sony-soporte.com/evidencias/tck1_consola.jpg'),
(1, 'comprobante', 'https://storage.sony-soporte.com/evidencias/tck1_boleta.pdf'),
(2, 'foto',        'https://storage.sony-soporte.com/evidencias/tck2_sensor.jpg');

UPDATE tickets 
SET estado = 'resuelto' 
WHERE codigo = 'TCK-2026-0001';

INSERT INTO diagnosticos (ticket_id, tecnico_id, hallazgos, aplica_garantia, solucion_aplicada)
VALUES (
    (SELECT id FROM tickets WHERE codigo = 'TCK-2026-0001'),
    (SELECT id FROM usuarios WHERE correo = 'marco.delgado@sony.com'),
    'Acumulación de polvo en el disipador térmico.',
    TRUE,
    'Mantenimiento integral, cambio de pasta térmica y pruebas de estrés.'
);