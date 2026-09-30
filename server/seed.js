// Script para poblar la EDT jerárquica con 4 niveles (PMBOK):
// Proyecto -> Fases -> Paquetes de Trabajo -> Actividades ejecutables
const baseUrl = 'http://localhost:3001/api';

async function seed() {
  console.log('🔄 1. Verificando proyectos existentes...');
  const resProyectos = await fetch(`${baseUrl}/proyectos`);
  const proyectos = await resProyectos.json();
  
  let fechaInicioOriginal = '2026-10-05';
  for (const p of proyectos) {
    if (p.nombre.toLowerCase().includes('recaudo')) {
      console.log(`   - Eliminando versión anterior: [${p.id}] ${p.nombre}`);
      if (p.fecha_inicio) fechaInicioOriginal = p.fecha_inicio;
      await fetch(`${baseUrl}/proyectos/${p.id}`, { method: 'DELETE' });
    }
  }

  console.log('\n✨ 2. Creando el Proyecto (con Nodo Raíz autogenerado)...');
  const resNuevo = await fetch(`${baseUrl}/proyectos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Sistema de Recaudo Electrónico para Transporte Urbano',
      descripcion: 'Implementación integral de sistema de recaudo con validadores IoT a bordo, motor transaccional offline-first y plataforma centralizada de gestión.',
      fecha_inicio: fechaInicioOriginal
    })
  });
  const proyecto = await resNuevo.json();
  console.log(`   Proyecto creado con ID: ${proyecto.id} (Fecha Inicio: ${fechaInicioOriginal})`);

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

  console.log('\n🌳 3. Construyendo árbol jerárquico EDT: Fases y Paquetes de Trabajo...');

  // ==========================================
  // FASE 1.1: Gestión del Proyecto
  // ==========================================
  const n1_1 = await crearNodo(n1.id, 'Gestión del Proyecto');
  const n1_1_1 = await crearNodo(n1_1.id, 'Acta de constitución y alcance del proyecto');
  const n1_1_2 = await crearNodo(n1_1.id, 'Cronograma de hitos y presupuesto detallado');
  const n1_1_3 = await crearNodo(n1_1.id, 'Plan de gestión de riesgos y calidad');
  const n1_1_4 = await crearNodo(n1_1.id, 'Informes de avance y actas de seguimiento');

  // ==========================================
  // FASE 1.2: Análisis y Diseño del Sistema
  // ==========================================
  const n1_2 = await crearNodo(n1.id, 'Análisis y Diseño del Sistema');
  const n1_2_1 = await crearNodo(n1_2.id, 'Documento de requerimientos funcionales y técnicos');
  const n1_2_2 = await crearNodo(n1_2.id, 'Arquitectura del sistema y flujo transaccional');
  const n1_2_3 = await crearNodo(n1_2.id, 'Modelo de datos y diseño del esquema relacional');
  const n1_2_4 = await crearNodo(n1_2.id, 'Prototipos de interfaces de usuario (Dashboard administrativo)');

  // ==========================================
  // FASE 1.3: Dispositivo Validador a Bordo (Hardware IoT)
  // ==========================================
  const n1_3 = await crearNodo(n1.id, 'Dispositivo Validador a Bordo (Hardware IoT)');
  const n1_3_1 = await crearNodo(n1_3.id, 'Módulo lector de proximidad RFID y escáner de códigos QR');
  const n1_3_2 = await crearNodo(n1_3.id, 'Microcontrolador y módulo de comunicación (GSM/4G y GPS)');
  const n1_3_3 = await crearNodo(n1_3.id, 'Carcasa antivandálica y estructura de anclaje para furgón/cabina');
  const n1_3_4 = await crearNodo(n1_3.id, 'Sistema de alimentación regulada (convertidor 12V/24V a 5V)');

  // ==========================================
  // FASE 1.4: Desarrollo del Ecosistema de Software
  // ==========================================
  const n1_4 = await crearNodo(n1.id, 'Desarrollo del Ecosistema de Software');
  const n1_4_1 = await crearNodo(n1_4.id, 'Firmware del dispositivo validador con almacenamiento offline-first');
  const n1_4_2 = await crearNodo(n1_4.id, 'API Backend y motor transaccional de procesamiento de cobros');
  const n1_4_3 = await crearNodo(n1_4.id, 'Base de datos centralizada con registros de auditoría contable');
  const n1_4_4 = await crearNodo(n1_4.id, 'Portal web administrativo para cooperativas y propietarios de buses');
  const n1_4_5 = await crearNodo(n1_4.id, 'Módulo de emisión, registro de UID y control de saldos');

  // ==========================================
  // FASE 1.5: Pruebas e Integración
  // ==========================================
  const n1_5 = await crearNodo(n1.id, 'Pruebas e Integración');
  const n1_5_1 = await crearNodo(n1_5.id, 'Informe de pruebas de lectura RFID/QR y tiempo de respuesta');
  const n1_5_2 = await crearNodo(n1_5.id, 'Informe de pruebas de concurrencia y estrés transaccional');
  const n1_5_3 = await crearNodo(n1_5.id, 'Informe de pruebas de sincronización de datos');
  const n1_5_4 = await crearNodo(n1_5.id, 'Informe de auditoría y seguridad de datos');

  // ==========================================
  // FASE 1.6: Implementación y Validación Piloto
  // ==========================================
  const n1_6 = await crearNodo(n1.id, 'Implementación y Validación Piloto');
  const n1_6_1 = await crearNodo(n1_6.id, 'Lote de tarjetas RFID configuradas para la fase de pruebas');
  const n1_6_2 = await crearNodo(n1_6.id, 'Unidad de transporte piloto instalada y conectada');
  const n1_6_3 = await crearNodo(n1_6.id, 'Manuales de operación del validador y guías para conductores');
  const n1_6_4 = await crearNodo(n1_6.id, 'Informe de evaluación operativa en ruta y conciliación financiera');

  console.log('   6 Fases y 25 Paquetes de Trabajo creados.');

  console.log('\n📋 4. Creando Actividades ejecutables bajo cada Paquete de Trabajo...');

  // --- Paquete 1.1.1 ---
  const n1_1_1_1 = await crearNodo(n1_1_1.id, 'Recopilar requerimientos de los patrocinadores y justificación del negocio');
  const a1_1_1_1 = await crearActividad(n1_1_1_1.id, 1, 2, 3, 'Diego');
  const n1_1_1_2 = await crearNodo(n1_1_1.id, 'Redactar acta de constitución y formalizar firma del comité');
  const a1_1_1_2 = await crearActividad(n1_1_1_2.id, 1, 2, 3, 'Diego');

  // --- Paquete 1.1.2 ---
  const n1_1_2_1 = await crearNodo(n1_1_2.id, 'Definir la estructura de desglose de trabajo (EDT) y diccionario');
  const a1_1_2_1 = await crearActividad(n1_1_2_1.id, 1, 2, 3, 'Paredes');
  const n1_1_2_2 = await crearNodo(n1_1_2.id, 'Estimar duraciones PERT y consolidar presupuesto base');
  const a1_1_2_2 = await crearActividad(n1_1_2_2.id, 2, 3, 4, 'Paredes');

  // --- Paquete 1.1.3 ---
  const n1_1_3_1 = await crearNodo(n1_1_3.id, 'Identificar matriz de riesgos operacionales y técnicos');
  const a1_1_3_1 = await crearActividad(n1_1_3_1.id, 1, 2, 3, 'Paredes');
  const n1_1_3_2 = await crearNodo(n1_1_3.id, 'Diseñar métricas de control de calidad y planes de mitigación');
  const a1_1_3_2 = await crearActividad(n1_1_3_2.id, 1, 2, 3, 'Paredes');

  // --- Paquete 1.1.4 ---
  const n1_1_4_1 = await crearNodo(n1_1_4.id, 'Establecer plantilla de control de valor ganado (EVM) e indicadores');
  const a1_1_4_1 = await crearActividad(n1_1_4_1.id, 1, 2, 3, 'Paredes');
  const n1_1_4_2 = await crearNodo(n1_1_4.id, 'Coordinar reuniones semanales de seguimiento y actas de control');
  const a1_1_4_2 = await crearActividad(n1_1_4_2.id, 2, 3, 4, 'Diego');

  // --- Paquete 1.2.1 ---
  const n1_2_1_1 = await crearNodo(n1_2_1.id, 'Levantar casos de uso de cobro a bordo y recarga de saldos');
  const a1_2_1_1 = await crearActividad(n1_2_1_1.id, 2, 3, 4, 'Paredes');
  const n1_2_1_2 = await crearNodo(n1_2_1.id, 'Especificar requerimientos no funcionales de seguridad y latencia');
  const a1_2_1_2 = await crearActividad(n1_2_1_2.id, 2, 3, 4, 'Falcon');

  // --- Paquete 1.2.2 ---
  const n1_2_2_1 = await crearNodo(n1_2_2.id, 'Diagramar arquitectura de microservicios y protocolos MQTT/HTTP');
  const a1_2_2_1 = await crearActividad(n1_2_2_1.id, 2, 3, 4, 'Falcon');
  const n1_2_2_2 = await crearNodo(n1_2_2.id, 'Diseñar flujo de validación offline-first y cola de sincronización');
  const a1_2_2_2 = await crearActividad(n1_2_2_2.id, 2, 3, 4, 'Falcon');

  // --- Paquete 1.2.3 ---
  const n1_2_3_1 = await crearNodo(n1_2_3.id, 'Diseñar diagrama entidad-relación y tablas de transacciones');
  const a1_2_3_1 = await crearActividad(n1_2_3_1.id, 1, 2, 3, 'Salazar');
  const n1_2_3_2 = await crearNodo(n1_2_3.id, 'Definir estrategia de indexación, particionamiento y auditoría');
  const a1_2_3_2 = await crearActividad(n1_2_3_2.id, 1, 2, 3, 'Salazar');

  // --- Paquete 1.2.4 ---
  const n1_2_4_1 = await crearNodo(n1_2_4.id, 'Diseñar wireframes de alta fidelidad en Figma para panel de control');
  const a1_2_4_1 = await crearActividad(n1_2_4_1.id, 2, 3, 4, 'Falcon');
  const n1_2_4_2 = await crearNodo(n1_2_4.id, 'Validar flujo de navegación con gerentes de cooperativas');
  const a1_2_4_2 = await crearActividad(n1_2_4_2.id, 1, 2, 3, 'Falcon');

  // --- Paquete 1.3.1 ---
  const n1_3_1_1 = await crearNodo(n1_3_1.id, 'Seleccionar e integrar módulo lector RFID RC522/PN532');
  const a1_3_1_1 = await crearActividad(n1_3_1_1.id, 2, 3, 4, 'Enrique');
  const n1_3_1_2 = await crearNodo(n1_3_1.id, 'Calibrar antena de radiofrecuencia y módulo óptico de códigos QR');
  const a1_3_1_2 = await crearActividad(n1_3_1_2.id, 2, 3, 4, 'Enrique');

  // --- Paquete 1.3.2 ---
  const n1_3_2_1 = await crearNodo(n1_3_2.id, 'Ensamblar placa base con procesador ESP32-S3 y módem 4G LTE');
  const a1_3_2_1 = await crearActividad(n1_3_2_1.id, 3, 4, 5, 'Enrique');
  const n1_3_2_2 = await crearNodo(n1_3_2.id, 'Conectar antena GPS activa y depurar precisión de telemetría');
  const a1_3_2_2 = await crearActividad(n1_3_2_2.id, 2, 3, 4, 'Enrique');

  // --- Paquete 1.3.3 ---
  const n1_3_3_1 = await crearNodo(n1_3_3.id, 'Modelar en CAD la envolvente IP54 y soporte mecánico articulado');
  const a1_3_3_1 = await crearActividad(n1_3_3_1.id, 2, 3, 4, 'Enrique');
  const n1_3_3_2 = await crearNodo(n1_3_3.id, 'Fabricar prototipos en corte láser e impresión 3D reforzada');
  const a1_3_3_2 = await crearActividad(n1_3_3_2.id, 2, 3, 4, 'Enrique');

  // --- Paquete 1.3.4 ---
  const n1_3_4_1 = await crearNodo(n1_3_4.id, 'Diseñar circuito reductor Buck step-down con protección automotriz');
  const a1_3_4_1 = await crearActividad(n1_3_4_1.id, 1, 2, 3, 'Enrique');
  const n1_3_4_2 = await crearNodo(n1_3_4.id, 'Soldar y verificar etapas de filtrado y fusible térmico');
  const a1_3_4_2 = await crearActividad(n1_3_4_2.id, 1, 2, 3, 'Enrique');

  // --- Paquete 1.4.1 ---
  const n1_4_1_1 = await crearNodo(n1_4_1.id, 'Programar lógica de lectura en C++/FreeRTOS y validación en Flash');
  const a1_4_1_1 = await crearActividad(n1_4_1_1.id, 4, 5, 6, 'Enrique');
  const n1_4_1_2 = await crearNodo(n1_4_1.id, 'Implementar rutina de cifrado AES-256 y cola de transacciones');
  const a1_4_1_2 = await crearActividad(n1_4_1_2.id, 3, 4, 5, 'Enrique');

  // --- Paquete 1.4.2 ---
  const n1_4_2_1 = await crearNodo(n1_4_2.id, 'Desarrollar endpoints RESTful y WebSocket de sincronización');
  const a1_4_2_1 = await crearActividad(n1_4_2_1.id, 4, 6, 8, 'Falcon');
  const n1_4_2_2 = await crearNodo(n1_4_2.id, 'Programar motor de validación de saldos y prevención de doble gasto');
  const a1_4_2_2 = await crearActividad(n1_4_2_2.id, 3, 5, 7, 'Falcon');

  // --- Paquete 1.4.3 ---
  const n1_4_3_1 = await crearNodo(n1_4_3.id, 'Desplegar clúster de base de datos con réplicas de lectura');
  const a1_4_3_1 = await crearActividad(n1_4_3_1.id, 2, 3, 4, 'Salazar');
  const n1_4_3_2 = await crearNodo(n1_4_3.id, 'Configurar triggers de auditoría inmutable para débitos y créditos');
  const a1_4_3_2 = await crearActividad(n1_4_3_2.id, 1, 2, 3, 'Salazar');

  // --- Paquete 1.4.4 ---
  const n1_4_4_1 = await crearNodo(n1_4_4.id, 'Desarrollar módulo de liquidación diaria por unidad de transporte');
  const a1_4_4_1 = await crearActividad(n1_4_4_1.id, 3, 4, 5, 'Falcon');
  const n1_4_4_2 = await crearNodo(n1_4_4.id, 'Construir reportes estadísticos de afluencia y exportación contable');
  const a1_4_4_2 = await crearActividad(n1_4_4_2.id, 2, 4, 6, 'Falcon');

  // --- Paquete 1.4.5 ---
  const n1_4_5_1 = await crearNodo(n1_4_5.id, 'Crear interfaz para empadronamiento de tarjetas y vinculación');
  const a1_4_5_1 = await crearActividad(n1_4_5_1.id, 2, 3, 4, 'Salazar');
  const n1_4_5_2 = await crearNodo(n1_4_5.id, 'Desarrollar módulo de recargas en puntos de venta y conciliación');
  const a1_4_5_2 = await crearActividad(n1_4_5_2.id, 2, 4, 6, 'Salazar');

  // --- Paquete 1.5.1 ---
  const n1_5_1_1 = await crearNodo(n1_5_1.id, 'Ejecutar 500 ciclos de lectura con tarjetas físicas a diferentes distancias');
  const a1_5_1_1 = await crearActividad(n1_5_1_1.id, 2, 3, 4, 'Enrique');
  const n1_5_1_2 = await crearNodo(n1_5_1.id, 'Medir latencia de confirmación sonora y visual en el validador');
  const a1_5_1_2 = await crearActividad(n1_5_1_2.id, 1, 2, 3, 'Enrique');

  // --- Paquete 1.5.2 ---
  const n1_5_2_1 = await crearNodo(n1_5_2.id, 'Simular carga con JMeter de 1,000 transacciones simultáneas');
  const a1_5_2_1 = await crearActividad(n1_5_2_1.id, 2, 3, 4, 'Falcon');
  const n1_5_2_2 = await crearNodo(n1_5_2.id, 'Evaluar estabilidad de la cola de sincronización ante pérdida de red 4G');
  const a1_5_2_2 = await crearActividad(n1_5_2_2.id, 2, 3, 4, 'Falcon');

  // --- Paquete 1.5.3 ---
  const n1_5_3_1 = await crearNodo(n1_5_3.id, 'Validar reconciliación de cobros offline al reconectar a red Wi-Fi/4G');
  const a1_5_3_1 = await crearActividad(n1_5_3_1.id, 2, 3, 4, 'Falcon');
  const n1_5_3_2 = await crearNodo(n1_5_3.id, 'Verificar consistencia de marcas temporales y coordenadas GPS');
  const a1_5_3_2 = await crearActividad(n1_5_3_2.id, 1, 2, 3, 'Falcon');

  // --- Paquete 1.5.4 ---
  const n1_5_4_1 = await crearNodo(n1_5_4.id, 'Realizar escaneo de vulnerabilidades en API y base de datos');
  const a1_5_4_1 = await crearActividad(n1_5_4_1.id, 2, 3, 4, 'Salazar');
  const n1_5_4_2 = await crearNodo(n1_5_4.id, 'Verificar integridad criptográfica de transacciones y llaves de acceso');
  const a1_5_4_2 = await crearActividad(n1_5_4_2.id, 1, 2, 3, 'Salazar');

  // --- Paquete 1.6.1 ---
  const n1_6_1_1 = await crearNodo(n1_6_1.id, 'Inicializar y grabar claves del sector seguro en 100 tarjetas Mifare');
  const a1_6_1_1 = await crearActividad(n1_6_1_1.id, 1, 2, 3, 'Enrique');
  const n1_6_1_2 = await crearNodo(n1_6_1.id, 'Rotular e inventariar credenciales para usuarios del plan piloto');
  const a1_6_1_2 = await crearActividad(n1_6_1_2.id, 1, 1, 1, 'Enrique');

  // --- Paquete 1.6.2 ---
  const n1_6_2_1 = await crearNodo(n1_6_2.id, 'Montar validador físico en barra pasamanos del bus seleccionado');
  const a1_6_2_1 = await crearActividad(n1_6_2_1.id, 1, 2, 3, 'Enrique');
  const n1_6_2_2 = await crearNodo(n1_6_2.id, 'Conectar a batería vehicular y calibrar encendido por ignición');
  const a1_6_2_2 = await crearActividad(n1_6_2_2.id, 1, 2, 3, 'Enrique');

  // --- Paquete 1.6.3 ---
  const n1_6_3_1 = await crearNodo(n1_6_3.id, 'Redactar guía rápida plastificada de encendido y alertas');
  const a1_6_3_1 = await crearActividad(n1_6_3_1.id, 1, 2, 3, 'Paredes');
  const n1_6_3_2 = await crearNodo(n1_6_3.id, 'Impartir sesión presencial de inducción técnica a conductores');
  const a1_6_3_2 = await crearActividad(n1_6_3_2.id, 1, 2, 3, 'Paredes');

  // --- Paquete 1.6.4 ---
  const n1_6_4_1 = await crearNodo(n1_6_4.id, 'Monitorear recaudación en vivo durante 3 días consecutivos de ruta');
  const a1_6_4_1 = await crearActividad(n1_6_4_1.id, 3, 4, 5, 'Diego');
  const n1_6_4_2 = await crearNodo(n1_6_4.id, 'Comparar corte de caja físico vs balance reportado por el sistema');
  const a1_6_4_2 = await crearActividad(n1_6_4_2.id, 2, 3, 4, 'Diego');

  console.log('   50 Actividades asignadas con responsables del catálogo.');

  console.log('\n🔗 5. Vinculando dependencias de la red...');

  // Dependencias internas dentro de cada paquete
  await crearDependencia(a1_1_1_1.id, a1_1_1_2.id);
  await crearDependencia(a1_1_2_1.id, a1_1_2_2.id);
  await crearDependencia(a1_1_3_1.id, a1_1_3_2.id);
  await crearDependencia(a1_1_4_1.id, a1_1_4_2.id);

  await crearDependencia(a1_2_1_1.id, a1_2_1_2.id);
  await crearDependencia(a1_2_2_1.id, a1_2_2_2.id);
  await crearDependencia(a1_2_3_1.id, a1_2_3_2.id);
  await crearDependencia(a1_2_4_1.id, a1_2_4_2.id);

  await crearDependencia(a1_3_1_1.id, a1_3_1_2.id);
  await crearDependencia(a1_3_2_1.id, a1_3_2_2.id);
  await crearDependencia(a1_3_3_1.id, a1_3_3_2.id);
  await crearDependencia(a1_3_4_1.id, a1_3_4_2.id);

  await crearDependencia(a1_4_1_1.id, a1_4_1_2.id);
  await crearDependencia(a1_4_2_1.id, a1_4_2_2.id);
  await crearDependencia(a1_4_3_1.id, a1_4_3_2.id);
  await crearDependencia(a1_4_4_1.id, a1_4_4_2.id);
  await crearDependencia(a1_4_5_1.id, a1_4_5_2.id);

  await crearDependencia(a1_5_1_1.id, a1_5_1_2.id);
  await crearDependencia(a1_5_2_1.id, a1_5_2_2.id);
  await crearDependencia(a1_5_3_1.id, a1_5_3_2.id);
  await crearDependencia(a1_5_4_1.id, a1_5_4_2.id);

  await crearDependencia(a1_6_1_1.id, a1_6_1_2.id);
  await crearDependencia(a1_6_2_1.id, a1_6_2_2.id);
  await crearDependencia(a1_6_3_1.id, a1_6_3_2.id);
  await crearDependencia(a1_6_4_1.id, a1_6_4_2.id);

  // Dependencias entre paquetes y fases
  // Fase 1: Gestión
  await crearDependencia(a1_1_1_2.id, a1_1_2_1.id);
  await crearDependencia(a1_1_1_2.id, a1_1_3_1.id);
  await crearDependencia(a1_1_3_2.id, a1_1_4_1.id);
  await crearDependencia(a1_1_2_2.id, a1_2_1_1.id);

  // Fase 2: Análisis y Diseño
  await crearDependencia(a1_2_1_2.id, a1_2_2_1.id);
  await crearDependencia(a1_2_2_2.id, a1_2_3_1.id);
  await crearDependencia(a1_2_1_2.id, a1_2_4_1.id);

  // Fase 3: Hardware IoT
  await crearDependencia(a1_2_2_2.id, a1_3_1_1.id);
  await crearDependencia(a1_2_2_2.id, a1_3_2_1.id);
  await crearDependencia(a1_3_1_2.id, a1_3_3_1.id);
  await crearDependencia(a1_3_2_2.id, a1_3_4_1.id);

  // Fase 4: Software
  await crearDependencia(a1_3_1_2.id, a1_4_1_1.id);
  await crearDependencia(a1_3_2_2.id, a1_4_1_1.id);
  await crearDependencia(a1_2_3_2.id, a1_4_2_1.id);
  await crearDependencia(a1_2_3_2.id, a1_4_3_1.id);
  await crearDependencia(a1_2_4_2.id, a1_4_4_1.id);
  await crearDependencia(a1_4_2_2.id, a1_4_4_1.id);
  await crearDependencia(a1_4_2_2.id, a1_4_5_1.id);
  await crearDependencia(a1_4_3_2.id, a1_4_5_1.id);

  // Fase 5: Pruebas e Integración
  await crearDependencia(a1_4_1_2.id, a1_5_1_1.id);
  await crearDependencia(a1_3_3_2.id, a1_5_1_1.id);
  await crearDependencia(a1_3_4_2.id, a1_5_1_1.id);
  await crearDependencia(a1_4_2_2.id, a1_5_2_1.id);
  await crearDependencia(a1_4_5_2.id, a1_5_2_1.id);
  await crearDependencia(a1_4_1_2.id, a1_5_3_1.id);
  await crearDependencia(a1_4_2_2.id, a1_5_3_1.id);
  await crearDependencia(a1_4_3_2.id, a1_5_4_1.id);
  await crearDependencia(a1_5_2_2.id, a1_5_4_1.id);

  // Fase 6: Piloto
  await crearDependencia(a1_4_5_2.id, a1_6_1_1.id);
  await crearDependencia(a1_5_1_2.id, a1_6_2_1.id);
  await crearDependencia(a1_5_3_2.id, a1_6_2_1.id);
  await crearDependencia(a1_4_4_2.id, a1_6_3_1.id);
  await crearDependencia(a1_6_1_2.id, a1_6_4_1.id);
  await crearDependencia(a1_6_2_2.id, a1_6_4_1.id);
  await crearDependencia(a1_6_3_2.id, a1_6_4_1.id);
  await crearDependencia(a1_5_4_2.id, a1_6_4_1.id);

  console.log('   Dependencias conectadas con éxito.');

  console.log('\n🎯 6. Calculando Ruta Crítica...');
  const resCpm = await fetch(`${baseUrl}/proyectos/${proyecto.id}/cpm`);
  const cpm = await resCpm.json();
  console.log(`   Duración Total del Proyecto: ${cpm.duracion_total} días`);
  console.log(`   Fecha de Inicio: ${cpm.fecha_inicio}`);
  console.log(`   Fecha de Fin: ${cpm.fecha_fin}`);
  console.log(`   Actividades Críticas: ${cpm.ruta_critica.length}`);
  console.log('\n✅ ¡Estructura de 4 niveles PMBOK configurada exitosamente!');
}

seed().catch(err => console.error('Error durante el seed:', err));
