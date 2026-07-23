-- =============================================================================
-- Migración idempotente para metas de vendedor por período
-- Agrega soporte para período mensual/anual sin borrar datos.
-- =============================================================================

SET @db_name := DATABASE();

SELECT COUNT(*)
INTO @has_tipo_periodo
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'vendedor_meta'
  AND COLUMN_NAME = 'tipo_periodo';

SET @sql_tipo_periodo := IF(
  @has_tipo_periodo = 0,
  'ALTER TABLE vendedor_meta ADD COLUMN tipo_periodo VARCHAR(20) NOT NULL DEFAULT ''anual'' AFTER meta',
  'SELECT 1'
);

PREPARE stmt_tipo_periodo FROM @sql_tipo_periodo;
EXECUTE stmt_tipo_periodo;
DEALLOCATE PREPARE stmt_tipo_periodo;

SELECT COUNT(*)
INTO @has_activo
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'vendedor_meta'
  AND COLUMN_NAME = 'activo';

SET @sql_activo := IF(
  @has_activo = 0,
  'ALTER TABLE vendedor_meta ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 AFTER tipo_periodo',
  'SELECT 1'
);

PREPARE stmt_activo FROM @sql_activo;
EXECUTE stmt_activo;
DEALLOCATE PREPARE stmt_activo;

SELECT COUNT(*)
INTO @has_observacion
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'vendedor_meta'
  AND COLUMN_NAME = 'observacion';

SET @sql_observacion := IF(
  @has_observacion = 0,
  'ALTER TABLE vendedor_meta ADD COLUMN observacion VARCHAR(255) NULL AFTER activo',
  'SELECT 1'
);

PREPARE stmt_observacion FROM @sql_observacion;
EXECUTE stmt_observacion;
DEALLOCATE PREPARE stmt_observacion;

UPDATE vendedor_meta
SET tipo_periodo = 'anual'
WHERE tipo_periodo IS NULL OR TRIM(tipo_periodo) = '';

UPDATE vendedor_meta
SET activo = 1
WHERE activo IS NULL;

UPDATE vendedor_meta
SET fecha = STR_TO_DATE(CONCAT(YEAR(fecha), '-01-01'), '%Y-%m-%d')
WHERE tipo_periodo = 'anual';

SELECT COUNT(*)
INTO @has_idx
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'vendedor_meta'
  AND INDEX_NAME = 'idx_vendedor_meta_usuario_periodo_fecha';

SET @sql_idx := IF(
  @has_idx = 0,
  'CREATE INDEX idx_vendedor_meta_usuario_periodo_fecha ON vendedor_meta (usuario_id, tipo_periodo, fecha)',
  'SELECT 1'
);

PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
