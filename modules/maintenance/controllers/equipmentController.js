const pool = require('../../../config/database');

// =====================================================
// EQUIPAMENTOS
// =====================================================

// Listar equipamentos
exports.getEquipment = async (req, res) => {
    try {
        const { status, category_id, location } = req.query;

        let query = `
            SELECT e.*, ec.name as category_name, 
                   r.room_number,
                   (SELECT COUNT(*) FROM work_orders WHERE equipment_id = e.id AND status = 'aberta') as open_orders
            FROM equipment e
            LEFT JOIN equipment_categories ec ON e.category_id = ec.id
            LEFT JOIN rooms r ON e.room_id = r.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND e.status = ?';
            params.push(status);
        }
        if (category_id) {
            query += ' AND e.category_id = ?';
            params.push(category_id);
        }
        if (location) {
            query += ' AND e.location LIKE ?';
            params.push(`%${location}%`);
        }

        query += ' ORDER BY e.name';

        const [equipment] = await pool.query(query, params);
        res.json(equipment);

    } catch (error) {
        console.error('Erro ao listar equipamentos:', error);
        res.status(500).json({ error: 'Erro ao listar equipamentos' });
    }
};

// Buscar equipamento por ID
exports.getEquipmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const [equipment] = await pool.query(
            `SELECT e.*, ec.name as category_name, r.room_number,
                    (SELECT COUNT(*) FROM work_orders WHERE equipment_id = e.id) as total_orders,
                    (SELECT COUNT(*) FROM work_orders WHERE equipment_id = e.id AND status = 'concluida') as completed_orders
             FROM equipment e
             LEFT JOIN equipment_categories ec ON e.category_id = ec.id
             LEFT JOIN rooms r ON e.room_id = r.id
             WHERE e.id = ?`,
            [id]
        );

        if (equipment.length === 0) {
            return res.status(404).json({ error: 'Equipamento não encontrado' });
        }

        // Buscar histórico de manutenção
        const [history] = await pool.query(
            `SELECT wo.*, u.name as created_by_name
             FROM work_orders wo
             LEFT JOIN users u ON wo.created_by = u.id
             WHERE wo.equipment_id = ?
             ORDER BY wo.created_at DESC
             LIMIT 10`,
            [id]
        );

        res.json({
            ...equipment[0],
            maintenance_history: history
        });

    } catch (error) {
        console.error('Erro ao buscar equipamento:', error);
        res.status(500).json({ error: 'Erro ao buscar equipamento' });
    }
};

// Criar equipamento
exports.createEquipment = async (req, res) => {
    try {
        const {
            category_id,
            name,
            description,
            serial_number,
            model,
            manufacturer,
            location,
            room_id,
            acquisition_date,
            warranty_end,
            useful_life,
            criticality,
            technical_specs
        } = req.body;

        const [result] = await pool.query(
            `INSERT INTO equipment 
             (category_id, name, description, serial_number, model, manufacturer, 
              location, room_id, acquisition_date, warranty_end, useful_life, criticality, technical_specs)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                category_id, name, description, serial_number, model, manufacturer,
                location, room_id || null, acquisition_date, warranty_end, useful_life,
                criticality || 'medio', technical_specs ? JSON.stringify(technical_specs) : null
            ]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Equipamento cadastrado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar equipamento:', error);
        res.status(500).json({ error: 'Erro ao criar equipamento' });
    }
};

// Atualizar equipamento
exports.updateEquipment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            category_id,
            name,
            description,
            serial_number,
            model,
            manufacturer,
            location,
            room_id,
            acquisition_date,
            warranty_end,
            useful_life,
            status,
            criticality,
            technical_specs
        } = req.body;

        await pool.query(
            `UPDATE equipment 
             SET category_id = ?, name = ?, description = ?, serial_number = ?, 
                 model = ?, manufacturer = ?, location = ?, room_id = ?,
                 acquisition_date = ?, warranty_end = ?, useful_life = ?,
                 status = ?, criticality = ?, technical_specs = ?
             WHERE id = ?`,
            [
                category_id, name, description, serial_number, model, manufacturer,
                location, room_id || null, acquisition_date, warranty_end, useful_life,
                status, criticality, technical_specs ? JSON.stringify(technical_specs) : null,
                id
            ]
        );

        res.json({ message: 'Equipamento atualizado com sucesso' });

    } catch (error) {
        console.error('Erro ao atualizar equipamento:', error);
        res.status(500).json({ error: 'Erro ao atualizar equipamento' });
    }
};

// =====================================================
// CATEGORIAS DE EQUIPAMENTOS
// =====================================================

exports.getEquipmentCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(
            `SELECT c.*, COUNT(e.id) as equipment_count
             FROM equipment_categories c
             LEFT JOIN equipment e ON c.id = e.category_id
             GROUP BY c.id
             ORDER BY c.name`
        );
        res.json(categories);
    } catch (error) {
        console.error('Erro ao listar categorias:', error);
        res.status(500).json({ error: 'Erro ao listar categorias' });
    }
};

exports.createEquipmentCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        const [result] = await pool.query(
            'INSERT INTO equipment_categories (name, description) VALUES (?, ?)',
            [name, description]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Categoria criada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        res.status(500).json({ error: 'Erro ao criar categoria' });
    }
};