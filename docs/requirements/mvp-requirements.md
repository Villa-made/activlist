# Requisitos del MVP — Plataforma de acción medioambiental

**Estado:** baseline funcional de Discovery; pendiente de revisión formal y especificación no funcional/técnica.  
**Convención:** `RQ-XX` conserva el identificador asignado en la entrevista. Las decisiones posteriores prevalecen sobre las anteriores. Los requisitos sustituidos se conservan expresamente para trazabilidad y **no son vigentes**.

## 1. Propósito, contribuciones y validación (RQ-01–RQ-25)

- **RQ-01 — Público objetivo.** El MVP se dirige a ciudadanos que participan libremente a título individual, sin pertenecer a organizaciones.
- **RQ-02 — Catálogo.** Solo se pueden registrar tipos de acciones definidos previamente en el catálogo.
- **RQ-03 — Validador principal.** La IA decide inicialmente si una contribución es válida; la comunidad puede respaldarla con «Me gusta» o denunciarla.
- **RQ-04 — Evidencia insuficiente.** Si la IA no puede verificar razonablemente una acción, solicita evidencias adicionales y no concede puntos hasta aprobarla.
- **RQ-05 — Puntuación por tipo.** Cada acción aprobada concede una cantidad fija de puntos según su tipo, no según cantidad o esfuerzo estimado.
- **RQ-06 — Ámbito de rankings de usuarios.** Existen rankings globales y locales para múltiples municipios.
- **RQ-07 — Doble atribución.** Una acción aprobada suma puntos al usuario y al municipio donde se declara realizada.
- **RQ-08 — Ranking local de usuarios.** Cuenta únicamente los puntos de acciones realizadas en el municipio; un usuario puede aparecer en varios rankings locales sin residir allí.
- **RQ-09 — Municipio híbrido.** La ubicación GPS propone un municipio, pero el usuario puede seleccionarlo manualmente.
- **RQ-10 — Espera entre acciones.** Se aplica un cooldown de 60 minutos para volver a obtener puntos por una acción del mismo tipo.
- **RQ-11 — Alcance del cooldown.** El cooldown se aplica por pareja **usuario + tipo de acción**, con independencia del municipio; diferentes tipos no se bloquean entre sí.
- **RQ-12 — Denuncias ordinarias.** Un administrador revisa las denuncias y puede invalidar una contribución y revocar los puntos personales y municipales.
- **RQ-13 — Estado durante denuncia ordinaria.** La contribución denunciada permanece pública y conserva sus puntos hasta la decisión del administrador; las reclamaciones de privacidad siguen una excepción (RQ-51 y RQ-56).
- **RQ-14 — Origen de fotografías.** Se permiten imágenes capturadas desde la web y seleccionadas de la galería del dispositivo.
- **RQ-15 — Publicación automática.** Al aprobarse, la contribución se publica automáticamente en el perfil del usuario y en la actividad comunitaria.
- **RQ-16 — Objetivo de producto.** El éxito principal es que los ciudadanos participen recurrentemente, no solo captar nuevas cuentas.
- **RQ-17 — Usuario recurrente.** Se considera recurrente al ciudadano que realiza al menos una contribución validada por semana.
- **RQ-18 — Evidencias mínimas.** Cada contribución exige **una fotografía y una descripción**, escrita o dictada mediante audio.
- **RQ-19 — Categoría inicial.** El MVP se limita a acciones medioambientales.
- **RQ-20 — Tipos iniciales.** El catálogo inicial incluye **reciclaje** y **recogida de residuos**.
- **RQ-21 — Criterio de IA.** La IA aplica validación razonable por coherencia y suficiencia de las evidencias; no se exige certeza absoluta.
- **RQ-22 — Comprobación temporal de galería (revisado).** La fecha de captura indicada en los metadatos de una foto de galería debe ser válida y no superar **60 minutos de antigüedad** respecto de la hora del servidor. Los metadatos son evidencia complementaria, no prueba de autenticidad.
- **RQ-23 — Hora del cooldown.** El cooldown se calcula desde la **hora original de registro en el servidor**, nunca desde la fecha EXIF.
- **RQ-24 — Imágenes parecidas (revisado).** **No** se buscarán ni rechazarán duplicados visuales: fotografías legítimas pueden ser iguales o muy similares.
- **RQ-25 — Galería sin fecha válida.** Si la foto de galería carece de metadatos temporales válidos, se solicita una nueva fotografía capturada desde la aplicación.

## 2. Acceso, interacción y puntuación (RQ-26–RQ-44)

- **RQ-26 — Acceso.** Solo los usuarios registrados pueden contribuir y acumular puntos; cualquier visitante puede consultar el contenido público sin registrarse.
- **RQ-27 — Identidad pública.** Cada usuario tiene un alias público único; no se exige mostrar el nombre real.
- **RQ-28 — Autenticación.** Se admite registro e inicio de sesión mediante correo y contraseña, Google y Apple.
- **RQ-29 — Plataforma.** El MVP solo estará disponible como **web responsive**; no habrá aplicaciones móviles nativas.
- **RQ-30 — Me gusta (revisado).** Las contribuciones pueden recibir «Me gusta», **sin conceder puntos**; sustituyen la decisión inicial de bonificar al autor.
- **RQ-31 — Destino de bonificaciones (sustituido).** Se había acordado dar puntos por «Me gusta» solo al autor, no al municipio. **Sin efecto:** RQ-30 elimina cualquier bonificación.
- **RQ-32 — Ranking de bonificaciones (sustituido).** Se había acordado sumar esos puntos solo al ranking global. **Sin efecto:** los «Me gusta» no alteran ningún ranking.
- **RQ-33 — Límite de bonificaciones (sustituido).** Se había acordado no limitar los puntos por «Me gusta». **Sin efecto:** no existen tales puntos.
- **RQ-34 — Reglas de Me gusta.** Un usuario registrado puede dar **un solo Me gusta por contribución ajena**, retirarlo y volverlo a poner; no se permiten «Me gusta» propios ni efectos acumulativos.
- **RQ-35 — Valor de bonificaciones (sustituido).** Se había acordado configurar los puntos por «Me gusta». **Sin efecto:** su puntuación es siempre cero.
- **RQ-36 — Puntuaciones iniciales.** **Reciclar: 10 puntos; recoger residuos: 20 puntos.** Son valores configurables.
- **RQ-37 — Períodos de rankings.** Los rankings de usuarios, locales y globales, incluyen vistas semanales, mensuales e históricas.
- **RQ-38 — Calendario.** La semana natural es de lunes a domingo; el mes es el mes natural; la clasificación histórica acumula todo el período de actividad.
- **RQ-39 — Zona horaria.** Todos los rankings y sus cortes temporales usan **UTC**.
- **RQ-40 — Imputación de puntos.** Los puntos de una acción aprobada se asignan al período de su **registro original en el servidor**, aunque se apruebe después.
- **RQ-41 — Correcciones históricas.** Los rankings de períodos finalizados pueden cambiar retroactivamente por aprobaciones tardías o revocaciones.
- **RQ-42 — Inicio del cooldown.** Solo las acciones **aprobadas** activan el cooldown, contado desde el registro original; las rechazadas no lo activan.
- **RQ-43 — Pendientes por tipo.** Cada usuario puede tener como máximo **una contribución pendiente por tipo de acción**, independientemente del municipio.
- **RQ-44 — Declaración manual de municipio.** Se acepta el municipio elegido manualmente **sin comprobación adicional** frente al GPS u otras evidencias.

## 3. Eliminación, privacidad y operaciones administrativas (RQ-45–RQ-66)

- **RQ-45 — Eliminar contribución.** La web advierte de la pérdida de puntos y pide confirmación; la publicación se oculta (*soft delete*), se retiran sus puntos al usuario y al municipio y queda un registro interno de trazabilidad.
- **RQ-46 — Retención para auditoría.** Se pretende conservar internamente las publicaciones eliminadas indefinidamente **solo en la medida legalmente permitida**. Los datos personales deberán suprimirse o anonimizarse cuando proceda; «auditoría» por sí sola no justifica retención ilimitada.
- **RQ-47 — Eliminar cuenta.** El perfil y toda la actividad se ocultan; se revocan todos los puntos personales y municipales asociados. Se conserva la trazabilidad únicamente dentro de los límites legales aplicables.
- **RQ-48 — Ventana de recuperación.** Una cuenta eliminada puede recuperarse dentro de los **30 días** siguientes, restaurando perfil, publicaciones y puntuaciones; pasado ese plazo ya no puede recuperarse.
- **RQ-49 — Recuperación explícita.** Durante los 30 días, el usuario inicia sesión con sus credenciales y confirma expresamente la recuperación; iniciar sesión no la reactiva automáticamente.
- **RQ-50 — Fotografías con terceros.** Se permiten fotografías con personas identificables o matrículas; se pide al autor confirmar las autorizaciones pertinentes cuando correspondan. No hay difuminado preventivo general.
- **RQ-51 — Protección preventiva de privacidad (matizado).** Una reclamación de privacidad puede motivar el ocultamiento temporal de la fotografía sin suspender puntos, **tras la revisión preliminar establecida en RQ-56**.
- **RQ-52 — Denuncia de privacidad estimada (revisado).** Si se acepta, la fotografía queda **completamente difuminada** públicamente, con aviso de la denuncia; la contribución sigue publicada y **conserva puntos** por la acción previamente validada. Se descartó permitir sustituir la foto como solución ordinaria.
- **RQ-53 — Descripción tras denuncia (revisado).** La descripción original permanece visible aun cuando la fotografía se difumine; deberán atenderse excepciones cuando la ley obligue a ocultar datos identificables. Se descartó fijar un plazo para «corregir» la foto.
- **RQ-54 — Quién denuncia privacidad.** Cualquier persona, también visitantes sin cuenta, puede presentar una reclamación de privacidad.
- **RQ-55 — Denuncias anónimas.** El visitante solo debe indicar el motivo de la denuncia; no se exige registro ni correo electrónico.
- **RQ-56 — Filtro preliminar.** Las denuncias anónimas de privacidad entran en revisión administrativa prioritaria; el administrador decide **antes de ocultar preventivamente** la fotografía.
- **RQ-57 — Audio a texto.** El dictado se transcribe automáticamente; solo se almacena y publica el texto, **no el audio original**.
- **RQ-58 — Corrección de transcripciones.** Antes de enviar, el usuario puede revisar y editar el texto transcrito; se valida la versión enviada.
- **RQ-59 — Descripción inmutable.** La descripción de una contribución aprobada no puede editarse.
- **RQ-60 — Vigencia de puntuaciones.** Los cambios de puntos solo afectan a **contribuciones registradas después del cambio**; las previas mantienen el valor original, incluso si aún están pendientes.
- **RQ-61 — Panel administrativo.** Los administradores pueden crear, modificar y desactivar acciones del catálogo, y configurar su puntuación.
- **RQ-62 — Rol administrativo.** Un único rol de administrador gestiona el catálogo, las puntuaciones y la moderación de denuncias.
- **RQ-63 — Notificaciones.** Los resultados de validación y las peticiones de nuevas evidencias se notifican **dentro de la web**; no se envían emails de notificación.
- **RQ-64 — Gamificación limitada.** El MVP usa **solo rankings**; no incorpora rachas ni insignias.
- **RQ-65 — Edad.** Solo pueden registrarse y participar personas de **18 años o más**.
- **RQ-66 — Comprobación de edad.** Se solicita una declaración responsable de mayoría de edad al registrarse, sin fecha de nacimiento ni verificación documental; no prueba la edad real.

## 4. Métricas, ámbito geográfico, feeds y clasificaciones (RQ-67–RQ-87)

- **RQ-67 — KPI principal.** La retención semanal consecutiva es el porcentaje de usuarios con al menos una acción validada en una semana que también la tienen en la siguiente; cada usuario cuenta una vez por ámbito y semana.
- **RQ-68 — Umbral de éxito.** Objetivo de **retención semanal media ≥ 30 %**.
- **RQ-69 — Horizonte de evaluación.** El MVP se evalúa durante las primeras **8 semanas completas** del período establecido.
- **RQ-70 — Agregación del KPI.** El criterio de éxito utiliza la **media de las 7 tasas** de retención entre semanas consecutivas; se estudia también su evolución.
- **RQ-71 — Inicio de evaluación.** El período comienza el **primer lunes a las 00:00 UTC posterior al lanzamiento**, con ocho semanas naturales completas.
- **RQ-72 — Exportación de analítica.** La administración puede exportar a **CSV** actividad semanal, tasas de retención, evolución y media; **no** se incluye dashboard analítico.
- **RQ-73 — Desglose estadístico.** Los CSV contienen estadísticas **agregadas globales y por municipio**, sin datos personales identificables.
- **RQ-74 — Retención territorial.** La retención local exige actividad validada en el **mismo municipio** en dos semanas consecutivas; la global admite contribuciones en cualquier municipio.
- **RQ-75 — Cobertura nacional.** Se admiten contribuciones exclusivamente en municipios de **España** durante el MVP.
- **RQ-76 — Todos los municipios.** Cualquier municipio español, incluidos pueblos pequeños, dispone de clasificación local sin mínimos de población o actividad.
- **RQ-77 — Selección oficial.** El municipio se elige mediante buscador/autocompletado sobre catálogo oficial con **códigos municipales del INE**.
- **RQ-78 — Feeds.** Hay un **feed global** y un **feed local por municipio**, con posibilidad de alternarlos y cambiar de municipio.
- **RQ-79 — Orden del feed.** Ambos feeds muestran primero las publicaciones que tienen **más Me gusta**.
- **RQ-80 — Ventana del feed.** Solo aparecen contribuciones de los **últimos 30 días**; las anteriores siguen accesibles desde el perfil público.
- **RQ-81 — Inicio de visibilidad.** La ventana de 30 días se cuenta desde la **fecha de aprobación/publicación**, no desde el registro; los puntos siguen imputándose al registro.
- **RQ-82 — Feed inicial.** Al acceder se muestra por defecto el **feed global**, sin requerir ubicación ni cuenta.
- **RQ-83 — Ranking entre municipios.** Existe una clasificación de municipios por puntos de acciones validadas, con períodos **semanales, mensuales e históricos**.
- **RQ-84 — Municipios listados.** En cada período solo aparecen municipios con **puntuación positiva**; los demás siguen localizables mediante el buscador.
- **RQ-85 — Comparación municipal.** Se utilizan **puntos absolutos**, sin normalización por población.
- **RQ-86 — Primer desempate.** Ante igualdad de puntos, se sitúa primero el usuario o municipio con **más contribuciones validadas** en el período.
- **RQ-87 — Empate completo.** Si también coincide el número de contribuciones, los usuarios o municipios **comparten puesto**.

## 5. Flujo de validación y recuperación ante fallos (RQ-88–RQ-91)

- **RQ-88 — Cancelación pendiente.** El usuario puede cancelar una contribución aún no aprobada, liberando el bloqueo por tipo; no genera puntos ni cooldown. Una respuesta tardía de IA no puede aprobar una contribución cancelada.
- **RQ-89 — Reintentos técnicos.** Ante fallos del servicio de IA se realizan reintentos automáticos limitados; la contribución permanece pendiente y se notifica si se agotan.
- **RQ-90 — Tras agotar reintentos.** El usuario puede solicitar una nueva validación manual de la contribución pendiente o cancelarla.
- **RQ-91 — Validación asíncrona.** La IA procesa las contribuciones en segundo plano; el usuario puede continuar navegando y recibe una notificación interna con el resultado.

## 6. Límites y decisiones abiertas

**Excluido del MVP:** aplicaciones nativas, países fuera de España, acciones sociales no medioambientales, rachas, insignias, puntos por «Me gusta», búsqueda de duplicados visuales, dashboard analítico y notificaciones por email.

**Pendiente de especificación/diseño, sin decisión aprobada:** estados y transiciones detallados; criterios medibles de validación por IA; número y frecuencia de reintentos; límites operativos, seguridad y requisitos no funcionales; mitigación de fraude (EXIF y municipio declarado no prueban autenticidad); protección de datos de terceros, bases legales y política de conservación/supresión; criterios de aceptación y casos de prueba.

**Regla de coherencia:** las acciones aprobadas generan puntos por actividad, no por popularidad; las revocaciones y restauraciones deben actualizar los rankings pertinentes, incluidos los períodos anteriores. Los casos de privacidad quedan sujetos a las obligaciones legales aunque se haya optado por mantener texto y puntos.
