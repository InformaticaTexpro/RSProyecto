'use strict';

// Datos ficticios de demostración. No provienen de APIs ni bases de datos.
window.GERENCIA_MOCK_DATA = {
  metadata: {
    simulated: true,
    source: 'Datos temporales de demostración',
    generatedAt: '2026-07-13',
  },

  comercial: {
    years: [2024, 2025, 2026],
    sellers: ['María González', 'Carlos Pérez', 'Nadia Soto', 'Sergio Muñoz', 'Norelbys Díaz'],
    channels: ['Mayorista', 'Retail', 'Proyectos'],
    monthlySales: {
      2023: [65000000, 71000000, 76000000, 82000000, 87000000, 92000000, 96000000, 91000000, 99000000, 104000000, 109000000, 116000000],
      2024: [71000000, 79000000, 85000000, 91000000, 96000000, 101000000, 105000000, 99000000, 108000000, 112000000, 118000000, 126000000],
      2025: [76000000, 83000000, 89000000, 95000000, 101000000, 106000000, 110000000, 104000000, 112000000, 118000000, 123000000, 137000000],
      2026: [82000000, 91000000, 98000000, 105000000, 112000000, 118000000, 121000000, 115000000, 124000000, 130000000, 136000000, 151000000],
    },
    annualTotals: {
      2024: 1191000000,
      2025: 1254000000,
      2026: 1383000000,
    },
    tableRows: {
      2024: [
        { vendedor: 'María González', canal: 'Mayorista', ventasActuales: 257000000, ventasAnteriores: 229000000, meta: 250000000 },
        { vendedor: 'Carlos Pérez', canal: 'Retail', ventasActuales: 234000000, ventasAnteriores: 218000000, meta: 240000000 },
        { vendedor: 'Nadia Soto', canal: 'Proyectos', ventasActuales: 210000000, ventasAnteriores: 194000000, meta: 215000000 },
        { vendedor: 'Sergio Muñoz', canal: 'Mayorista', ventasActuales: 198000000, ventasAnteriores: 190000000, meta: 205000000 },
        { vendedor: 'Norelbys Díaz', canal: 'Retail', ventasActuales: 182000000, ventasAnteriores: 174000000, meta: 190000000 },
      ],
      2025: [
        { vendedor: 'María González', canal: 'Mayorista', ventasActuales: 276000000, ventasAnteriores: 257000000, meta: 270000000 },
        { vendedor: 'Carlos Pérez', canal: 'Retail', ventasActuales: 255000000, ventasAnteriores: 234000000, meta: 250000000 },
        { vendedor: 'Nadia Soto', canal: 'Proyectos', ventasActuales: 225000000, ventasAnteriores: 210000000, meta: 225000000 },
        { vendedor: 'Sergio Muñoz', canal: 'Mayorista', ventasActuales: 211000000, ventasAnteriores: 198000000, meta: 215000000 },
        { vendedor: 'Norelbys Díaz', canal: 'Retail', ventasActuales: 195000000, ventasAnteriores: 182000000, meta: 200000000 },
      ],
      2026: [
        { vendedor: 'María González', canal: 'Mayorista', ventasActuales: 318000000, ventasAnteriores: 276000000, meta: 300000000 },
        { vendedor: 'Carlos Pérez', canal: 'Retail', ventasActuales: 284000000, ventasAnteriores: 255000000, meta: 280000000 },
        { vendedor: 'Nadia Soto', canal: 'Proyectos', ventasActuales: 246000000, ventasAnteriores: 225000000, meta: 250000000 },
        { vendedor: 'Sergio Muñoz', canal: 'Mayorista', ventasActuales: 228000000, ventasAnteriores: 211000000, meta: 235000000 },
        { vendedor: 'Norelbys Díaz', canal: 'Retail', ventasActuales: 208500000, ventasAnteriores: 195000000, meta: 215000000 },
      ],
    },
  },

  finanzas: {
    years: [2025, 2026],
    cashFlow: {
      2025: {
        meses: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        ingresos: [188000000, 197000000, 204000000, 216000000, 228000000, 239000000],
        egresos: [149000000, 154000000, 159000000, 166000000, 172000000, 181000000],
      },
      2026: {
        meses: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        ingresos: [210000000, 225000000, 238000000, 251000000, 262000000, 274000000],
        egresos: [155000000, 162000000, 168000000, 175000000, 181000000, 194000000],
      },
    },
    expenses: [
      { categoria: 'Materias primas', valor: 36 },
      { categoria: 'Remuneraciones', valor: 24 },
      { categoria: 'Logística', valor: 15 },
      { categoria: 'Servicios', valor: 12 },
      { categoria: 'Impuestos', valor: 8 },
      { categoria: 'Otros', valor: 5 },
    ],
    accounts: [
      { year: 2026, concepto: 'Factura clientes mayoristas', tipo: 'Por cobrar', monto: 86000000, vencimiento: '2026-07-25', estado: 'Pendiente', responsable: 'Cobranza' },
      { year: 2026, concepto: 'Proveedor materias primas', tipo: 'Por pagar', monto: 54000000, vencimiento: '2026-07-20', estado: 'Programado', responsable: 'Finanzas' },
      { year: 2026, concepto: 'Proyectos corporativos', tipo: 'Por cobrar', monto: 112000000, vencimiento: '2026-08-05', estado: 'En gestión', responsable: 'Comercial' },
      { year: 2026, concepto: 'Servicios logísticos', tipo: 'Por pagar', monto: 43000000, vencimiento: '2026-07-28', estado: 'Pendiente', responsable: 'Operaciones' },
      { year: 2026, concepto: 'Clientes retail', tipo: 'Por cobrar', monto: 88000000, vencimiento: '2026-08-12', estado: 'Vigente', responsable: 'Cobranza' },
      { year: 2026, concepto: 'Impuestos mensuales', tipo: 'Por pagar', monto: 97000000, vencimiento: '2026-07-31', estado: 'Programado', responsable: 'Contabilidad' },
      { year: 2025, concepto: 'Factura clientes mayoristas', tipo: 'Por cobrar', monto: 72000000, vencimiento: '2025-07-25', estado: 'Pagado', responsable: 'Cobranza' },
      { year: 2025, concepto: 'Proveedor materias primas', tipo: 'Por pagar', monto: 49000000, vencimiento: '2025-07-20', estado: 'Pagado', responsable: 'Finanzas' },
    ],
  },
};
