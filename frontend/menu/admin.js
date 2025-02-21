document.addEventListener('DOMContentLoaded', () => {
    const productForm = document.getElementById('productForm');
    const productList = document.getElementById('productList');
    const categoriaSelect = document.getElementById('categoria');
    const saboresContainer = document.getElementById('saboresContainer');
    let currentDeleteId = null;

    // Función para mostrar notificaciones
    function mostrarNotificacion(mensaje, tipo = 'exito') {
        const notificacion = document.getElementById('notificacion');
        const icono = notificacion.querySelector('.notificacion-icon');
        const texto = notificacion.querySelector('.notificacion-text');
        
        if (tipo === 'exito') {
            icono.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>';
            notificacion.style.backgroundColor = '#4CAF50';
        } else {
            icono.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
            notificacion.style.backgroundColor = '#f44336';
        }
        
        texto.textContent = mensaje;
        notificacion.classList.add('show');
        
        setTimeout(() => {
            notificacion.classList.remove('show');
        }, 5000); // 5 segundos
    }

    // Mostrar campo de sabores solo para bebidas
    categoriaSelect.addEventListener('change', () => {
        saboresContainer.style.display = categoriaSelect.value === 'bebidas' ? 'block' : 'none';
    });

    // Cargar productos al inicio
    fetch('/menu')
        .then(response => response.json())
        .then(data => data.forEach(product => addProductToDOM(product)))
        .catch(error => mostrarNotificacion('Error al cargar el menú: ' + error, 'error'));

    // Agregar/Editar producto
    productForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const newProduct = {
            nombre: document.getElementById('nombre').value,
            categoria: document.getElementById('categoria').value,
            imagen: document.getElementById('imagen').value,
            precioCop: parseFloat(document.getElementById('precioCop').value),
            precioUsd: parseFloat(document.getElementById('precioUsd').value),
            descripcion: document.getElementById('descripcion').value,
            sabores: categoriaSelect.value === 'bebidas' 
                ? document.getElementById('sabores').value.split(',').map(s => s.trim()) 
                : undefined
        };

        const method = productForm.querySelector('button').textContent === 'Agregar Producto' ? 'POST' : 'PUT';
        const url = method === 'POST' ? '/menu' : `/menu/${editingId}`;

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProduct)
        })
        .then(response => response.json())
        .then(data => {
            const mensaje = method === 'POST' ? 'Producto agregado' : 'Producto actualizado';
            mostrarNotificacion(`${mensaje} exitosamente`);
            productForm.reset();
            if (method === 'PUT') {
                setTimeout(() => location.reload(), 1000);
            }
        })
        .catch(error => mostrarNotificacion('Error: ' + error, 'error'));
    });

    // Función para mostrar productos
    function addProductToDOM(product) {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${product.nombre}</strong> (${product.categoria})<br>
            ${product.sabores ? `<small>Sabores: ${product.sabores.join(', ')}</small><br>` : ''}
            <img src="${product.imagen}" alt="${product.nombre}" style="width: 100px;"><br>
            COP: ${product.precioCop} | USD: ${product.precioUsd}<br>
            ${product.descripcion}<br>
            <button onclick="editProduct(${product.id})">Editar</button>
            <button onclick="deleteProduct(${product.id})">Eliminar</button>
        `;
        productList.appendChild(li);
    }

    // Funciones de eliminar y editar
    window.deleteProduct = (id) => {
        mostrarConfirmacion(id);
    };

    let editingId;
    window.editProduct = (id) => {
        fetch('/menu')
            .then(response => response.json())
            .then(menu => {
                const product = menu.find(p => p.id == id);
                if (product) {
                    editingId = id;
                    document.getElementById('nombre').value = product.nombre;
                    document.getElementById('categoria').value = product.categoria;
                    document.getElementById('imagen').value = product.imagen;
                    document.getElementById('precioCop').value = product.precioCop;
                    document.getElementById('precioUsd').value = product.precioUsd;
                    document.getElementById('descripcion').value = product.descripcion;
                    document.getElementById('sabores').value = product.sabores?.join(', ') || '';
                    productForm.querySelector('button').textContent = 'Guardar Cambios';
                    saboresContainer.style.display = product.categoria === 'bebidas' ? 'block' : 'none';
                }
            })
            .catch(error => mostrarNotificacion('Error: ' + error, 'error'));
    };

    // Sistema de confirmación personalizado
    function mostrarConfirmacion(id) {
        const modal = document.getElementById('customConfirm');
        currentDeleteId = id;
        modal.style.display = 'block';
    }

    // Event Listeners para el modal
    document.querySelector('.close-confirm').addEventListener('click', () => {
        document.getElementById('customConfirm').style.display = 'none';
    });

    document.getElementById('confirmCancel').addEventListener('click', () => {
        document.getElementById('customConfirm').style.display = 'none';
    });

    document.getElementById('confirmDelete').addEventListener('click', () => {
        if (currentDeleteId) {
            fetch(`/menu/${currentDeleteId}`, { method: 'DELETE' })
                .then(() => {
                    mostrarNotificacion('Producto eliminado exitosamente');
                    document.getElementById('customConfirm').style.display = 'none';
                    setTimeout(() => location.reload(), 1000);
                })
                .catch(error => mostrarNotificacion('Error al eliminar: ' + error, 'error'));
        }
    });
    function descargarReporteDiario() {
        fetch('/descargar-excel')
            .then(response => {
                if (response.ok) {
                    window.open('/descargar-excel', '_blank');
                } else {
                    alert('No hay pedidos registrados hoy');
                }
            })
            .catch(error => alert('Error al descargar el reporte: ' + error));
    }
});