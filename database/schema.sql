-- =====================================================================
-- Sony Soporte Técnico · Esquema PostgreSQL + datos de prueba
-- ATENCIÓN: borra todo el esquema "public" antes de recrearlo.
-- Ejecutar solo con:  npm run db:init -- --confirmar
-- =====================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;

-- ---------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ---------------------------------------------------------------------
CREATE TYPE rol_usuario AS ENUM ('cliente', 'tecnico', 'administrador');

CREATE TYPE estado_ticket AS ENUM (
    'registrado',                 -- el cliente envió la solicitud
    'en_revision',                -- un técnico tomó la orden
    'pendiente_aprobacion_admin', -- el técnico envió diagnóstico y presupuesto
    'revisar_precio_tecnico',     -- el administrador pidió ajustar el precio
    'presupuesto_enviado',        -- el administrador aprobó; espera al cliente
    'reparacion_aceptada',        -- el cliente aceptó el presupuesto
    'reparacion_rechazada',       -- el cliente rechazó el presupuesto
    'resuelto',                   -- el técnico terminó la reparación
    'cancelado'                   -- el cliente canceló antes de la revisión
);

CREATE TYPE gravedad_ticket AS ENUM ('baja', 'media', 'alta');
CREATE TYPE tipo_evidencia  AS ENUM ('foto', 'comprobante');

-- ---------------------------------------------------------------------
-- 2. USUARIOS
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
    id              BIGSERIAL PRIMARY KEY,
    rol             rol_usuario  NOT NULL,
    nombres         VARCHAR(80)  NOT NULL,
    apellidos       VARCHAR(80)  NOT NULL,
    dni             VARCHAR(20)  UNIQUE,
    correo          VARCHAR(150) NOT NULL,
    celular         VARCHAR(20),
    password_hash   VARCHAR(255) NOT NULL,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_registro  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_usuarios_correo CHECK (correo = lower(correo))
);

-- El correo es único sin importar mayúsculas/minúsculas.
CREATE UNIQUE INDEX uq_usuarios_correo ON usuarios (correo);
CREATE INDEX idx_usuarios_rol ON usuarios (rol);

-- ---------------------------------------------------------------------
-- 3. PRODUCTOS (catálogo de referencia)
-- ---------------------------------------------------------------------
CREATE TABLE productos (
    id           BIGSERIAL PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL,
    categoria    VARCHAR(80)  NOT NULL,
    modelo       VARCHAR(80),
    descripcion  TEXT,
    activo       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- 4. TICKETS
-- ---------------------------------------------------------------------
CREATE SEQUENCE tickets_codigo_seq START 1000;

CREATE TABLE tickets (
    id                           BIGSERIAL PRIMARY KEY,
    codigo                       VARCHAR(20)  NOT NULL UNIQUE,
    cliente_id                   BIGINT       NOT NULL REFERENCES usuarios(id),
    tecnico_id                   BIGINT       REFERENCES usuarios(id),
    producto_id                  BIGINT       REFERENCES productos(id),
    producto                     VARCHAR(150) NOT NULL,
    categoria                    VARCHAR(80)  NOT NULL,
    numero_serie                 VARCHAR(50)  NOT NULL,
    numero_boleta                VARCHAR(20)  NOT NULL,
    fecha_compra                 DATE         NOT NULL,
    descripcion_falla            TEXT         NOT NULL,
    gravedad                     gravedad_ticket NOT NULL DEFAULT 'baja',
    garantia_vencida             BOOLEAN      NOT NULL DEFAULT FALSE,
    cliente_acepto_revision_pago BOOLEAN      NOT NULL DEFAULT TRUE,
    comentario_admin             TEXT,
    estado                       estado_ticket NOT NULL DEFAULT 'registrado',
    fecha_creacion               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fecha_actualizacion          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_tickets_longitudes CHECK (
        char_length(descripcion_falla) BETWEEN 10 AND 2000
    )
);

CREATE INDEX idx_tickets_cliente ON tickets (cliente_id);
CREATE INDEX idx_tickets_tecnico ON tickets (tecnico_id);
CREATE INDEX idx_tickets_estado  ON tickets (estado);

-- Garantiza que el cliente sea cliente y el técnico sea técnico.
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

-- ---------------------------------------------------------------------
-- 5. EVIDENCIAS (foto del daño; url_archivo guarda la imagen como data URL)
-- ---------------------------------------------------------------------
CREATE TABLE evidencias (
    id            BIGSERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tipo          tipo_evidencia NOT NULL,
    url_archivo   TEXT NOT NULL,
    fecha_subida  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidencias_ticket ON evidencias (ticket_id);

-- ---------------------------------------------------------------------
-- 6. DIAGNÓSTICOS Y PRESUPUESTO (uno por ticket)
-- ---------------------------------------------------------------------
CREATE TABLE diagnosticos (
    id                 BIGSERIAL PRIMARY KEY,
    ticket_id          BIGINT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    tecnico_id         BIGINT NOT NULL REFERENCES usuarios(id),
    hallazgos          TEXT NOT NULL,
    aplica_garantia    BOOLEAN NOT NULL DEFAULT FALSE,
    costo_estimado     NUMERIC(10,2) NOT NULL DEFAULT 0,   -- propuesto por el técnico
    costo_oficial      NUMERIC(10,2),                      -- aprobado por el administrador
    solucion_aplicada  TEXT,
    cliente_acepto     BOOLEAN,                            -- respuesta del cliente al presupuesto
    fecha_diagnostico  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_costo_estimado_positivo CHECK (costo_estimado >= 0),
    CONSTRAINT chk_costo_oficial_positivo  CHECK (costo_oficial  IS NULL OR costo_oficial >= 0),
    CONSTRAINT chk_costo_garantia          CHECK (NOT aplica_garantia OR costo_estimado = 0)
);

-- ---------------------------------------------------------------------
-- 7. HISTORIAL DE ESTADOS
-- ---------------------------------------------------------------------
CREATE TABLE historial_estados (
    id               BIGSERIAL PRIMARY KEY,
    ticket_id        BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    estado_anterior  estado_ticket,
    estado_nuevo     estado_ticket NOT NULL,
    usuario_id       BIGINT REFERENCES usuarios(id),
    fecha_cambio     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_ticket ON historial_estados (ticket_id);

-- ---------------------------------------------------------------------
-- 8. MENSAJES (chat cliente <-> técnico)
-- ---------------------------------------------------------------------
CREATE TABLE mensajes (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id),
    texto       VARCHAR(1000) NOT NULL CHECK (char_length(btrim(texto)) > 0),
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mensajes_ticket ON mensajes (ticket_id, fecha);

-- ---------------------------------------------------------------------
-- 9. NOTIFICACIONES
-- ---------------------------------------------------------------------
CREATE TABLE notificaciones (
    id           BIGSERIAL PRIMARY KEY,
    usuario_id   BIGINT NOT NULL REFERENCES usuarios(id),
    ticket_id    BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    mensaje      TEXT NOT NULL,
    leido        BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_envio  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_usuario ON notificaciones (usuario_id, leido);

-- ---------------------------------------------------------------------
-- 10. TRIGGERS AUTOMÁTICOS
-- La API indica quién hace el cambio con: set_config('app.usuario_id', id, true)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tickets_cambio_estado() RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion := now();

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo, usuario_id)
        VALUES (NEW.id, OLD.estado, NEW.estado,
                NULLIF(current_setting('app.usuario_id', true), '')::BIGINT);

        INSERT INTO notificaciones (usuario_id, ticket_id, mensaje)
        VALUES (NEW.cliente_id, NEW.id,
                'Tu ticket ' || NEW.codigo || ' cambió de estado a: ' || NEW.estado);
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

-- =====================================================================
-- DATOS DE PRUEBA (ficticios)
-- Contraseñas (bcrypt, coste 12): clientes = cliente123,
-- técnicos = tecnico123, administrador = admin123
-- =====================================================================
INSERT INTO usuarios (rol, nombres, apellidos, dni, correo, celular, password_hash) VALUES
('cliente',       'Lucía',  'Ramos',   '71234567', 'lucia.ramos@mail.com',     '987654321', '$2b$12$F43rjJifcIW5.r10l22sruEFNkIQBovnwgOTgVqa0nqW8OGwQLvZy'),
('tecnico',       'Marco',  'Delgado', '72345678', 'marco.delgado@sony.com',   '987654322', '$2b$12$bl9LOBd62TFjonw36YjVH.rjB8Pi6UV6JjQ.zcjBhoO2.RwTiBiO2'),
('administrador', 'Paula',  'Núñez',   '73456789', 'paula.nunez@sony.com',     '987654323', '$2b$12$boeqZnVylOIWTwFTp3y6b.fSprJkN4ayXl6dgvRipKvBlre/O91dO'),
('cliente',       'Carlos', 'Mendoza', '74561234', 'carlos.mendoza@gmail.com', '951234567', '$2b$12$F43rjJifcIW5.r10l22sruEFNkIQBovnwgOTgVqa0nqW8OGwQLvZy'),
('tecnico',       'Jorge',  'Campos',  '73112233', 'jorge.campos@sony.com',    '945678123', '$2b$12$bl9LOBd62TFjonw36YjVH.rjB8Pi6UV6JjQ.zcjBhoO2.RwTiBiO2');

INSERT INTO productos (nombre, categoria, modelo, descripcion) VALUES
('PlayStation 5 Slim',      'Consolas / Gaming', 'CFI-2016A',  'Consola de videojuegos PS5'),
('Televisor Bravia XR 55"', 'Televisores',       'XR-55A80L',  'Smart TV OLED 4K'),
('Audífonos WH-1000XM5',    'Audio',             'WH-1000XM5', 'Audífonos inalámbricos con cancelación de ruido'),
('Cámara Alpha 7 IV',       'Fotografía',        'ILCE-7M4',   'Cámara fotográfica profesional');

-- Ticket 1: consola en garantía, ya resuelta
INSERT INTO tickets (codigo, cliente_id, tecnico_id, producto_id, producto, categoria, numero_serie,
                     numero_boleta, fecha_compra, descripcion_falla, estado)
VALUES ('TCK-2026-0001',
        (SELECT id FROM usuarios WHERE correo = 'lucia.ramos@mail.com'),
        (SELECT id FROM usuarios WHERE correo = 'marco.delgado@sony.com'),
        (SELECT id FROM productos WHERE modelo = 'CFI-2016A'),
        'PlayStation 5 Slim', 'Consolas / Gaming', 'SN-PS5-984321', 'B001-004521', '2025-12-15',
        'La consola se apaga sola a los 10 minutos de juego.', 'registrado');

-- Ticket 2: cámara en revisión
INSERT INTO tickets (codigo, cliente_id, tecnico_id, producto_id, producto, categoria, numero_serie,
                     numero_boleta, fecha_compra, descripcion_falla, estado)
VALUES ('TCK-2026-0002',
        (SELECT id FROM usuarios WHERE correo = 'carlos.mendoza@gmail.com'),
        (SELECT id FROM usuarios WHERE correo = 'marco.delgado@sony.com'),
        (SELECT id FROM productos WHERE modelo = 'ILCE-7M4'),
        'Cámara Alpha 7 IV', 'Fotografía', 'SN-CAM-789012', 'B002-001873', '2025-11-20',
        'El sensor presenta manchas internas y no enfoca correctamente.', 'en_revision');

-- Ticket 3: televisor sin garantía, esperando que un técnico lo tome
INSERT INTO tickets (codigo, cliente_id, producto_id, producto, categoria, numero_serie, numero_boleta,
                     fecha_compra, descripcion_falla, estado, gravedad, garantia_vencida)
VALUES ('TCK-2026-0003',
        (SELECT id FROM usuarios WHERE correo = 'lucia.ramos@mail.com'),
        (SELECT id FROM productos WHERE modelo = 'XR-55A80L'),
        'Televisor Bravia XR 55"', 'Televisores', 'SN-TV-550231', 'B001-002210', '2023-08-10',
        'La pantalla muestra una línea vertical verde y se apaga a los pocos minutos.',
        'registrado', 'media', TRUE);

INSERT INTO diagnosticos (ticket_id, tecnico_id, hallazgos, aplica_garantia, costo_estimado,
                          costo_oficial, solucion_aplicada, cliente_acepto)
VALUES ((SELECT id FROM tickets WHERE codigo = 'TCK-2026-0001'),
        (SELECT id FROM usuarios WHERE correo = 'marco.delgado@sony.com'),
        'Acumulación de polvo en el disipador térmico.', TRUE, 0, 0,
        'Mantenimiento integral, cambio de pasta térmica y pruebas de estrés.', TRUE);

UPDATE tickets SET estado = 'resuelto' WHERE codigo = 'TCK-2026-0001';

INSERT INTO mensajes (ticket_id, usuario_id, texto)
VALUES ((SELECT id FROM tickets WHERE codigo = 'TCK-2026-0002'),
        (SELECT id FROM usuarios WHERE correo = 'marco.delgado@sony.com'),
        'Hola Carlos, ya recibí tu cámara. Reviso el sensor y te escribo con el diagnóstico.');
