const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Archivos de datos
const MENU_FILE = path.join(__dirname, 'menu.json');
const HISTORICO_FILE = path.join(__dirname, 'historico.json');

// Inicializar datos
let menu = [];
let historico = [];
let ordenes = [];
let contadorPedidos = 1;

// Cargar datos existentes
try {
    menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));
} catch (error) {
    fs.writeFileSync(MENU_FILE, '[]');
}

try {
    historico = JSON.parse(fs.readFileSync(HISTORICO_FILE, 'utf8'));
} catch (error) {
    fs.writeFileSync(HISTORICO_FILE, '[]');
}

// Función para guardar el menú
const saveMenu = () => fs.writeFileSync(MENU_FILE, JSON.stringify(menu, null, 2));

// Función para exportar a Excel
function exportarPedidosAExcel() {
    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `pedidos_${fechaHoy}.xlsx`;
    const rutaArchivo = path.join(__dirname, 'archivos_excel', nombreArchivo);

    if (!fs.existsSync(path.join(__dirname, 'archivos_excel'))) {
        fs.mkdirSync(path.join(__dirname, 'archivos_excel'));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pedidos');

    // Encabezados
    worksheet.addRow([
        'ID Pedido', 
        'Mesa', 
        'Productos', 
        'Cantidad Total', 
        'Total COP', 
        'Total USD', 
        'Hora Pedido',
        'Estado'
    ]);

    // Datos
    ordenes.forEach(pedido => {
        worksheet.addRow([
            pedido.id,
            pedido.mesa,
            pedido.pedido.map(item => `${item.nombre} (x${item.cantidad})`).join('\n'),
            pedido.pedido.reduce((total, item) => total + item.cantidad, 0),
            pedido.pedido.reduce((total, item) => total + (item.precioCop * item.cantidad), 0),
            pedido.pedido.reduce((total, item) => total + (item.precioUsd * item.cantidad), 0).toFixed(2),
            pedido.timestamp,
            pedido.status
        ]);
    });

    // Estilos
    worksheet.columns = [
        { width: 15 }, { width: 10 }, { width: 35 }, 
        { width: 15 }, { width: 15 }, { width: 15 }, 
        { width: 20 }, { width: 15 }
    ];

    workbook.xlsx.writeFile(rutaArchivo)
        .then(() => console.log(`📊 Reporte diario generado: ${nombreArchivo}`))
        .catch(error => console.error('Error al generar Excel:', error));
}

// Exportar y limpiar cada 24 horas
setInterval(() => {
    exportarPedidosAExcel();
    
    // Guardar en histórico
    historico = historico.concat(ordenes.map(pedido => ({
        ...pedido,
        fecha: new Date().toISOString().split('T')[0]
    })));
    fs.writeFileSync(HISTORICO_FILE, JSON.stringify(historico, null, 2));
    
    ordenes = [];
    contadorPedidos = 1;
}, 24 * 60 * 60 * 1000);

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend/menu')));
app.use(express.json());

// ==================== SEGURIDAD MEJORADA ==================== 
// Middleware de autenticación con JWT
const authenticateJWT = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// Ruta para generar un token JWT
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.COOK_USER && password === process.env.COOK_PASS) {
        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).send('Credenciales incorrectas');
    }
});

// Proteger la ruta de cocina con JWT
app.use('/cocina', authenticateJWT, express.static(path.join(__dirname, '../frontend/menu')));

// Validación de pedidos
const validarPedido = (pedido) => {
    return Array.isArray(pedido) && pedido.every(item => 
        item.nombre && item.precioCop && item.precioUsd && item.cantidad
    );
};

// Endpoints para órdenes
app.get('/ordenes', (req, res) => res.json(ordenes));

app.post('/orden', (req, res) => {
    if (!validarPedido(req.body.pedido)) {
        return res.status(400).send('Formato de pedido inválido');
    }

    const newOrder = {
        ...req.body,
        id: `PED-${String(contadorPedidos).padStart(3, '0')}`,
        status: 'preparando',
        prioridad: req.body.pedido.some(item => item.nombre?.toLowerCase().includes('bebida')) ? 'baja' : 'alta',
        timestamp: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        mesa: req.body.mesa || '0'
    };

    contadorPedidos++;
    ordenes.unshift(newOrder);
    io.emit('nueva-orden', newOrder);
    res.sendStatus(200);
});

app.put('/orden/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const orderIndex = ordenes.findIndex(o => o.id == id);
    if (orderIndex !== -1) {
        ordenes[orderIndex].status = status;
        io.emit('actualizar-estado', { id: id, status });
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// Endpoints para el menú
app.get('/menu', (req, res) => res.json(menu));

app.post('/menu', (req, res) => {
    const { nombre, categoria, imagen, precioCop, precioUsd, descripcion } = req.body;

    if (!nombre || !categoria || !imagen || !precioCop || !precioUsd || !descripcion) {
        return res.status(400).send('Faltan campos obligatorios');
    }

    const newProduct = {
        id: Date.now(),
        nombre,
        categoria,
        imagen,
        precioCop,
        precioUsd,
        descripcion
    };

    menu.push(newProduct);
    saveMenu();
    io.emit('menu-actualizado', newProduct);
    res.status(201).json(newProduct);
});

app.put('/menu/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const productIndex = menu.findIndex(p => p.id == id);
    if (productIndex === -1) {
        return res.status(404).json({ error: "Producto no encontrado" });
    }

    menu[productIndex] = { ...menu[productIndex], ...updates };
    saveMenu();
    io.emit('menu-actualizado', menu[productIndex]);
    res.json(menu[productIndex]);
});

app.delete('/menu/:id', (req, res) => {
    const { id } = req.params;
    menu = menu.filter(p => p.id != id);
    saveMenu();
    io.emit('menu-actualizado', { id });
    res.sendStatus(204);
});

// Nuevos endpoints
app.get('/descargar-excel', (req, res) => {
    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `pedidos_${fechaHoy}.xlsx`;
    const rutaArchivo = path.join(__dirname, 'archivos_excel', nombreArchivo);

    fs.existsSync(rutaArchivo) 
        ? res.download(rutaArchivo)
        : res.status(404).send('No hay registros para hoy');
});

app.get('/historico', (req, res) => {
    res.json(historico);
});

// Rutas estáticas
app.get('/cocina', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/menu/cocina.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/menu/admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/menu/index.html'));
});

// Iniciar servidor
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`✅ Servidor en puerto ${PORT}`);
});
