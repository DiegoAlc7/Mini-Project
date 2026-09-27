// Script para limpiar proyectos anteriores y cargar la nueva EDT con los 5 miembros del catálogo
const baseUrl = 'http://localhost:3001/api';

async function seed() {
  console.log('🔄 1. Verificando proyectos existentes...');
  const resProyectos = await fetch(`${baseUrl}/proyectos`);
  const proyectos = await resProyectos.json();
  
  for (const p of proyectos) {
    if (p.nombre.toLowerCase().includes('recaudo')) {
      console.log(`   - Eliminando versión anterior: [${p.id}] ${p.nombre}`);
      await fetch(`${baseUrl}/proyectos/${p.id}`, { method: 'DELETE' });
    }
  }

  console.log('\n✨ 2. Creando el Proyecto (con Nodo Raíz autogenerado - Regla 1)...');
  const resNuevo = await fetch(`${baseUrl}/proyectos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Sistema de Recaudo Electrónico para Transporte Urbano',
      descripcion: 'Implementación integral de sistema de recaudo con validadores IoT a bordo, motor transaccional offline-first y plataforma centralizada de gestión.',
      fecha_inicio: '2026-10-05'
    })
  });
  const proyecto = await resNuevo.json();
  console.log(`   Proyecto creado con ID: ${proyecto.id}`);

  // Obtener el nodo raíz autogenerado (código 1)
  const resEdt = await fetch(`${baseUrl}/proyectos/${proyecto.id}/edt`);
  const arbolInicial = await resEdt.json();
  const n1 = arbolInicial[0];
  console.log(`   Nodo Raíz autogenerado detectado: [ID ${n1.id}] ${n1.codigo} ${n1.nombre}`);

  // Helper para crear nodos EDT
  async function crearNodo(padre_id, nombre, descripcion = '') {
    const res = await fetch(`${baseUrl}/proyectos/${proyecto.id}/edt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padre_id, nombre, descripcion })
    });
    return await res.json();
  }

  // Helper para crear actividades (upsert inline)
  async function crearActividad(nodo_edt_id, to, tm, tp, responsable) {
    const res = await fetch(`${baseUrl}/actividades/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodo_edt_id,
        duracion_optimista: to,
        duracion_probable: tm,
        duracion_pesimista: tp,
        responsable
      })
    });
    return await res.json();
  }

  // Helper para dependencias
  async function crearDependencia(predecesora_id, sucesora_id) {
    const res = await fetch(`${baseUrl}/dependencias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predecesora_id, sucesora_id, tipo: 'FS', desfase_dias: 0 })
    });
    return await res.json();
  }

  console.log('\n🌳 3. Construyendo árbol EDT bajo el Nodo Raíz autogenerado...');

  // 1.1 Gestión del Proyecto
  const n1_1 = await crearNodo(n1.id, 'Gestión del Proyecto');
  const n1_1_1 = await crearNodo(n1_1.id, 'Acta de constitución y alcance del proyecto');
  const n1_1_2 = await crearNodo(n1_1.id, 'Cronograma de hitos y presupuesto detallado');
  const n1_1_3 = await crearNodo(n1_1.id, 'Plan de gestión de riesgos y calidad');
  const n1_1_4 = await crearNodo(n1_1.id, 'Informes de avance y actas de seguimiento');

  // 1.2 Análisis y Diseño del Sistema
  const n1_2 = await crearNodo(n1.id, 'Análisis y Diseño del Sistema');
  const n1_2_1 = await crearNodo(n1_2.id, 'Documento de requerimientos funcionales y técnicos');
  const n1_2_2 = await crearNodo(n1_2.id, 'Arquitectura del sistema y flujo transaccional');
  const n1_2_3 = await crearNodo(n1_2.id, 'Modelo de datos y diseño del esquema relacional');
  const n1_2_4 = await crearNodo(n1_2.id, 'Prototipos de interfaces de usuario (Dashboard administrativo)');

  // 1.3 Dispositivo Validador a Bordo (Hardware IoT)
  const n1_3 = await crearNodo(n1.id, 'Dispositivo Validador a Bordo (Hardware IoT)');
  const n1_3_1 = await crearNodo(n1_3.id, 'Módulo lector de proximidad RFID y escáner de códigos QR');
  const n1_3_2 = await crearNodo(n1_3.id, 'Microcontrolador y módulo de comunicación (GSM/4G y GPS)');
  const n1_3_3 = await crearNodo(n1_3.id, 'Carcasa antivandálica y estructura de anclaje para furgón/cabina');
  const n1_3_4 = await crearNodo(n1_3.id, 'Sistema de alimentación regulada (convertidor 12V/24V a 5V)');

  // 1.4 Desarrollo del Ecosistema de Software
  const n1_4 = await crearNodo(n1.id, 'Desarrollo del Ecosistema de Software');
  const n1_4_1 = await crearNodo(n1_4.id, 'Firmware del dispositivo validador con almacenamiento offline-first');
  const n1_4_2 = await crearNodo(n1_4.id, 'API Backend y motor transaccional de procesamiento de cobros');
  const n1_4_3 = await crearNodo(n1_4.id, 'Base de datos centralizada con registros de auditoría contable');
  const n1_4_4 = await crearNodo(n1_4.id, 'Portal web administrativo para cooperativas y propietarios de buses');
  const n1_4_5 = await crearNodo(n1_4.id, 'Módulo de emisión, registro de UID y control de saldos');

  // 1.5 Pruebas e Integración
  const n1_5 = await crearNodo(n1.id, 'Pruebas e Integración');
  const n1_5_1 = await crearNodo(n1_5.id, 'Informe de pruebas de lectura RFID/QR y tiempo de respuesta');
  const n1_5_2 = await crearNodo(n1_5.id, 'Informe de pruebas de concurrencia y estrés transaccional');
  const n1_5_3 = await crearNodo(n1_5.id, 'Informe de pruebas de sincronización de datos');
  const n1_5_4 = await crearNodo(n1_5.id, 'Informe de auditoría y seguridad de datos');

  // 1.6 Implementación y Validación Piloto
  const n1_6 = await crearNodo(n1.id, 'Implementación y Validación Piloto');
  const n1_6_1 = await crearNodo(n1_6.id, 'Lote de tarjetas RFID configuradas para la fase de pruebas');
  const n1_6_2 = await crearNodo(n1_6.id, 'Unidad de transporte piloto instalada y conectada');
  const n1_6_3 = await crearNodo(n1_6.id, 'Manuales de operación del validador y guías para conductores');
  const n1_6_4 = await crearNodo(n1_6.id, 'Informe de evaluación operativa en ruta y conciliación financiera');

  console.log('   Estructura EDT creada.');

  console.log('\n📋 4. Asignando Actividades y Responsables del Catálogo...');

  // Asignaciones con los 5 miembros: Diego, Falcon, Salazar, Paredes, Enrique
  const a1_1_1 = await crearActividad(n1_1_1.id, 2, 3, 4, 'Diego');
  const a1_1_2 = await crearActividad(n1_1_2.id, 2, 3, 4, 'Paredes');
  const a1_1_3 = await crearActividad(n1_1_3.id, 2, 3, 10, 'Paredes');
  const a1_1_4 = await crearActividad(n1_1_4.id, 2, 4, 6, 'Paredes');

  const a1_2_1 = await crearActividad(n1_2_1.id, 3, 5, 7, 'Paredes');
  const a1_2_2 = await crearActividad(n1_2_2.id, 3, 4, 5, 'Falcon');
  const a1_2_3 = await crearActividad(n1_2_3.id, 2, 3, 4, 'Salazar');
  const a1_2_4 = await crearActividad(n1_2_4.id, 2, 4, 6, 'Falcon');

  const a1_3_1 = await crearActividad(n1_3_1.id, 4, 6, 8, 'Enrique');
  const a1_3_2 = await crearActividad(n1_3_2.id, 5, 7, 9, 'Enrique');
  const a1_3_3 = await crearActividad(n1_3_3.id, 3, 5, 7, 'Enrique');
  const a1_3_4 = await crearActividad(n1_3_4.id, 2, 3, 4, 'Enrique');

  const a1_4_1 = await crearActividad(n1_4_1.id, 6, 9, 12, 'Enrique');
  const a1_4_2 = await crearActividad(n1_4_2.id, 7, 10, 13, 'Falcon');
  const a1_4_3 = await crearActividad(n1_4_3.id, 3, 4, 5, 'Salazar');
  const a1_4_4 = await crearActividad(n1_4_4.id, 5, 8, 11, 'Falcon');
  const a1_4_5 = await crearActividad(n1_4_5.id, 4, 6, 8, 'Salazar');

  const a1_5_1 = await crearActividad(n1_5_1.id, 3, 4, 5, 'Enrique');
  const a1_5_2 = await crearActividad(n1_5_2.id, 3, 5, 7, 'Falcon');
  const a1_5_3 = await crearActividad(n1_5_3.id, 3, 5, 7, 'Falcon');
  const a1_5_4 = await crearActividad(n1_5_4.id, 3, 4, 5, 'Salazar');

  const a1_6_1 = await crearActividad(n1_6_1.id, 2, 3, 4, 'Enrique');
  const a1_6_2 = await crearActividad(n1_6_2.id, 3, 4, 5, 'Enrique');
  const a1_6_3 = await crearActividad(n1_6_3.id, 2, 3, 4, 'Paredes');
  const a1_6_4 = await crearActividad(n1_6_4.id, 4, 6, 8, 'Diego');

  console.log('   25 Actividades asignadas con responsables del catálogo.');

  console.log('\n🔗 5. Vinculando dependencias de la red...');

  // Gestión
  await crearDependencia(a1_1_1.id, a1_1_2.id);
  await crearDependencia(a1_1_1.id, a1_1_3.id);
  await crearDependencia(a1_1_3.id, a1_1_4.id);
  await crearDependencia(a1_1_2.id, a1_2_1.id);

  // Análisis y Diseño
  await crearDependencia(a1_2_1.id, a1_2_2.id);
  await crearDependencia(a1_2_2.id, a1_2_3.id);
  await crearDependencia(a1_2_1.id, a1_2_4.id);

  // Hardware IoT
  await crearDependencia(a1_2_2.id, a1_3_1.id);
  await crearDependencia(a1_2_2.id, a1_3_2.id);
  await crearDependencia(a1_3_1.id, a1_3_3.id);
  await crearDependencia(a1_3_2.id, a1_3_4.id);

  // Software
  await crearDependencia(a1_3_1.id, a1_4_1.id);
  await crearDependencia(a1_3_2.id, a1_4_1.id);
  await crearDependencia(a1_2_3.id, a1_4_2.id);
  await crearDependencia(a1_2_3.id, a1_4_3.id);
  await crearDependencia(a1_2_4.id, a1_4_4.id);
  await crearDependencia(a1_4_2.id, a1_4_4.id);
  await crearDependencia(a1_4_2.id, a1_4_5.id);
  await crearDependencia(a1_4_3.id, a1_4_5.id);

  // Pruebas
  await crearDependencia(a1_4_1.id, a1_5_1.id);
  await crearDependencia(a1_3_3.id, a1_5_1.id);
  await crearDependencia(a1_3_4.id, a1_5_1.id);
  await crearDependencia(a1_4_2.id, a1_5_2.id);
  await crearDependencia(a1_4_5.id, a1_5_2.id);
  await crearDependencia(a1_4_1.id, a1_5_3.id);
  await crearDependencia(a1_4_2.id, a1_5_3.id);
  await crearDependencia(a1_4_3.id, a1_5_4.id);
  await crearDependencia(a1_5_2.id, a1_5_4.id);

  // Piloto
  await crearDependencia(a1_4_5.id, a1_6_1.id);
  await crearDependencia(a1_5_1.id, a1_6_2.id);
  await crearDependencia(a1_5_3.id, a1_6_2.id);
  await crearDependencia(a1_4_4.id, a1_6_3.id);
  await crearDependencia(a1_6_1.id, a1_6_4.id);
  await crearDependencia(a1_6_2.id, a1_6_4.id);
  await crearDependencia(a1_6_3.id, a1_6_4.id);
  await crearDependencia(a1_5_4.id, a1_6_4.id);

  console.log('   Dependencias conectadas con éxito.');

  console.log('\n🎯 6. Calculando Ruta Crítica...');
  const resCpm = await fetch(`${baseUrl}/proyectos/${proyecto.id}/cpm`);
  const cpm = await resCpm.json();
  console.log(`   Duración Total del Proyecto: ${cpm.duracion_total} días`);
  console.log(`   Fecha de Inicio: ${cpm.fecha_inicio}`);
  console.log(`   Fecha de Fin: ${cpm.fecha_fin}`);
  console.log(`   Actividades Críticas: ${cpm.ruta_critica.length}`);
  console.log('\n✅ ¡Proyecto configurado exitosamente con miembros del catálogo!');
}

seed().catch(err => console.error('Error durante el seed:', err));
