document.addEventListener('DOMContentLoaded', () => {
    const listaPedido = document.getElementById('lista-pedido');
    const totalCopElement = document.getElementById('total-cop');
    const totalUsdElement = document.getElementById('total-usd');
    const confirmarPedidoBtn = document.getElementById('confirmar-pedido');
    const mensajeConfirmacion = document.getElementById('mensaje-confirmacion');
    const nuevoPedidoBtn = document.getElementById('nuevo-pedido');
    const notas = document.getElementById('notas');
    const urlParams = new URLSearchParams(window.location.search);
    const mesa = urlParams.get('mesa') || '0';
    
    let pedido = [];
    let totalCop = 0;
    let totalUsd = 0;

    // Conexión con Socket.IO
    const socket = io('https://restaurante-jkxc.onrender.com');

    // Función para renderizar el menú
    const renderizarMenu = async () => {
        const response = await fetch('https://restaurante-jkxc.onrender.com/menu');
        const menu = await response.json();
        
        // Mapear categorías a IDs de contenedores
        const categorias = {
            general: '#menu-general',
            sopas: '#menu-sopas',
            bebidas: '#menu-bebidas'
        };

        // Limpiar contenedores
        Object.values(categorias).forEach(selector => {
            document.querySelector(selector).innerHTML = '';
        });

        // Generar HTML para cada producto
        menu.forEach(producto => {
            const contenedor = document.querySelector(categorias[producto.categoria]);
            const htmlProducto = `
                <div class="plato">
                    <img src="${producto.imagen}" alt="${producto.nombre}">
                    <div class="info">
                        <h3>${producto.nombre}</h3>
                        <p>${producto.descripcion}</p>
                        <p class="precio">$${producto.precioCop.toLocaleString('es-CO')} COP / $${producto.precioUsd} USD</p>
                        ${producto.sabores ? `
                            <select class="sabor-jugo">
                                ${producto.sabores.map(sabor => `<option value="${sabor}">${sabor}</option>`).join('')}
                            </select>
                        ` : ''}
                        <button class="agregar" 
                            data-nombre="${producto.nombre}" 
                            data-precio-cop="${producto.precioCop}" 
                            data-precio-usd="${producto.precioUsd}">
                            Agregar al Pedido
                        </button>
                    </div>
                </div>
            `;
            contenedor.insertAdjacentHTML('beforeend', htmlProducto);
        });

        // Re-asignar eventos a los botones
        document.querySelectorAll('.agregar').forEach(button => {
            button.addEventListener('click', agregarAlPedido);
        });
    };

    // Llamar a la función al cargar la página
    renderizarMenu();

    // Escuchar actualizaciones del menú
    socket.on('menu-actualizado', renderizarMenu);

    // Función para agregar un producto al pedido
    const agregarAlPedido = (event) => {
        const button = event.target;
        const platoPadre = button.closest('.plato');
        const nombre = button.getAttribute('data-nombre');
        const sabor = platoPadre.querySelector('.sabor-jugo')?.value;
        const precioCop = parseFloat(button.getAttribute('data-precio-cop'));
        const precioUsd = parseFloat(button.getAttribute('data-precio-usd'));

        // Buscar si ya existe el mismo ítem
        const itemExistente = pedido.find(item => 
            item.nombre === nombre && 
            (!item.sabor || item.sabor === sabor)
        );

        if (itemExistente) {
            itemExistente.cantidad++;
        } else {
            pedido.push({ 
                nombre, 
                sabor,
                precioCop, 
                precioUsd, 
                cantidad: 1 
            });
        }

        renderizarPedido();

        // Notificación mejorada para todos los dispositivos
        Swal.fire({
            icon: 'success',
            title: '¡Añadido!',
            text: `${nombre}${sabor ? ` (${sabor})` : ''} se ha añadido al pedido.`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            background: '#28a745',
            color: '#fff',
            iconColor: '#fff'
        });
    };

    // Función para actualizar el total
    const actualizarTotal = () => {
        totalCop = pedido.reduce((sum, item) => sum + (item.precioCop * item.cantidad), 0);
        totalUsd = pedido.reduce((sum, item) => sum + (item.precioUsd * item.cantidad), 0);
        totalCopElement.textContent = `$${totalCop.toLocaleString('es-CO')} COP`;
        totalUsdElement.textContent = `$${totalUsd.toFixed(2)} USD`;
    };

    // Función para renderizar el pedido
    const renderizarPedido = () => {
        listaPedido.innerHTML = '';
        pedido.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                ${item.nombre}${item.sabor ? ` (${item.sabor})` : ''} 
                <div class="cantidad">
                    <button class="btn-cantidad" onclick="modificarCantidad(${index}, -1)">-</button>
                    <span>x${item.cantidad}</span>
                    <button class="btn-cantidad" onclick="modificarCantidad(${index}, 1)">+</button>
                </div>
                <button onclick="eliminarPlato(${index})"><i class="fas fa-trash"></i></button>
            `;
            listaPedido.appendChild(li);
        });
        actualizarTotal();
    };

    // Función para modificar cantidad
    window.modificarCantidad = (index, cambio) => {
        pedido[index].cantidad += cambio;
        if (pedido[index].cantidad < 1) pedido.splice(index, 1);
        renderizarPedido();
    };

    // Función para eliminar plato
    window.eliminarPlato = (index) => {
        pedido.splice(index, 1);
        renderizarPedido();
    };

    // Confirmar pedido (versión mejorada)
    confirmarPedidoBtn.addEventListener('click', () => {
        if (pedido.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Pedido vacío',
                text: 'Agrega al menos un plato al pedido.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
            return;
        }

        Swal.fire({
            title: '¿Confirmar pedido?',
            html: `Total: <b>$${totalCop.toLocaleString('es-CO')} COP</b><br>($${totalUsd.toFixed(2)} USD)`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#28a745',
            cancelButtonColor: '#dc3545',
            confirmButtonText: '¡Sí, enviar!',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                const nota = notas.value;
                fetch('https://restaurante-jkxc.onrender.com/orden', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        pedido, 
                        totalCop, 
                        totalUsd, 
                        nota,
                        mesa
                    })
                })
                .then(response => {
                    if (response.ok) {
                        // Reproducir sonido de envío
                        new Audio('send-sound.mp3').play().catch(() => {});
                        // Notificación mejorada para todos los dispositivos
                        Swal.fire({
                            title: '¡Enviado!',
                            text: 'Pedido enviado a cocina',
                            icon: 'success',
                            toast: true,
                            position: 'top-end',
                            timer: 3000
                        });

                        // Reiniciar interfaz
                        mensajeConfirmacion.classList.remove('mensaje-oculto');
                        pedido = [];
                        listaPedido.innerHTML = '';
                        totalCopElement.textContent = '$0 COP';
                        totalUsdElement.textContent = '$0.00 USD';
                        notas.value = '';
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'No se pudo enviar el pedido',
                            toast: true,
                            position: 'top-end',
                            timer: 3000
                        });
                    }
                })
                .catch(error => {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error de conexión',
                        text: error.message,
                        toast: true,
                        position: 'top-end',
                        timer: 3000
                    });
                });
            }
        });
    });

    // Botón para nuevo pedido
    nuevoPedidoBtn.addEventListener('click', () => {
        mensajeConfirmacion.classList.add('mensaje-oculto');
    });
});
