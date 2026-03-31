const pool = require('../../../config/database');
const { registerOperation } = require('../../../utils/codeGenerator');

// =====================================================
// LISTAR EQUIPAMENTOS
// =====================================================
exports.getEquipment = async (req, res) => {
    try {
        const { status, category_id, code } = req.query;

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
        if (code) {
            query += ' AND e.operation_code = ?';
            params.push(code);
        }

        query += ' ORDER BY e.name';

        const [equipment] = await pool.query(query, params);
        res.json(equipment);

    } catch (error) {
        console.error('Erro ao listar equipamentos:', error);
        res.status(500).json({ error: 'Erro ao listar equipamentos' });
    }
};

// =====================================================
// BUSCAR EQUIPAMENTO POR ID
// =====================================================
exports.getEquipmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const [equipment] = await pool.query(`
            SELECT e.*, ec.name as category_name, r.room_number,
                   (SELECT COUNT(*) FROM work_orders WHERE equipment_id = e.id) as total_orders,
                   (SELECT COUNT(*) FROM work_orders WHERE equipment_id = e.id AND status = 'concluida') as completed_orders
            FROM equipment e
            LEFT JOIN equipment_categories ec ON e.category_id = ec.id
            LEFT JOIN rooms r ON e.room_id = r.id
            WHERE e.id = ?
        `, [id]);

        if (equipment.length === 0) {
            return res.status(404).json({ error: 'Equipamento não encontrado' });
        }

        const [history] = await pool.query(`
            SELECT wo.*, u.name as created_by_name
            FROM work_orders wo
            LEFT JOIN users u ON wo.created_by = u.id
            WHERE wo.equipment_id = ?
            ORDER BY wo.created_at DESC
            LIMIT 10
        `, [id]);

        res.json({
            ...equipment[0],
            maintenance_history: history
        });

    } catch (error) {
        console.error('Erro ao buscar equipamento:', error);
        res.status(500).json({ error: 'Erro ao buscar equipamento' });
    }
};

// =====================================================
// BUSCAR EQUIPAMENTO POR CÓDIGO
// =====================================================
exports.getEquipmentByCode = async (req, res) => {
    try {
        const { code } = req.params;

        const [equipment] = await pool.query(`
            SELECT e.*, ec.name as category_name, r.room_number
            FROM equipment e
            LEFT JOIN equipment_categories ec ON e.category_id = ec.id
            LEFT JOIN rooms r ON e.room_id = r.id
            WHERE e.operation_code = ?
        `, [code]);

        if (equipment.length === 0) {
            return res.status(404).json({ error: 'Equipamento não encontrado' });
        }

        res.json(equipment[0]);

    } catch (error) {
        console.error('Erro ao buscar equipamento por código:', error);
        res.status(500).json({ error: 'Erro ao buscar equipamento' });
    }
};

// =====================================================
// CRIAR EQUIPAMENTO (COM CÓDIGO)
// =====================================================
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

        // Tratar valores vazios como NULL
        const usefulLifeValue = useful_life && useful_life !== '' ? parseInt(useful_life) : null;
        const roomIdValue = room_id && room_id !== '' ? parseInt(room_id) : null;
        const acquisitionDateValue = acquisition_date && acquisition_date !== '' ? acquisition_date : null;
        const warrantyEndValue = warranty_end && warranty_end !== '' ? warranty_end : null;

        const [result] = await pool.query(
            `INSERT INTO equipment 
             (category_id, name, description, serial_number, model, manufacturer, 
              location, room_id, acquisition_date, warranty_end, useful_life, 
              criticality, technical_specs, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'operacional', ?)`,
            [
                category_id, name, description || null, serial_number || null, model || null, manufacturer || null,
                location || null, roomIdValue, acquisitionDateValue, warrantyEndValue, usefulLifeValue,
                criticality || 'medio', technical_specs ? JSON.stringify(technical_specs) : null,
                req.userId
            ]
        );

        const equipmentId = result.insertId;

        // Gerar código de operação
        const operationCode = await registerOperation('equipment', equipmentId, pool);

        await pool.query(
            'UPDATE equipment SET operation_code = ? WHERE id = ?',
            [operationCode, equipmentId]
        );

        console.log(`✅ Equipamento criado com código: ${operationCode}`);

        res.status(201).json({
            id: equipmentId,
            operationCode,
            message: 'Equipamento cadastrado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar equipamento:', error);
        res.status(500).json({ error: 'Erro ao criar equipamento' });
    }
};

// =====================================================
// ATUALIZAR EQUIPAMENTO
// =====================================================
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

        // Tratar valores vazios como NULL
        const usefulLifeValue = useful_life && useful_life !== '' ? parseInt(useful_life) : null;
        const roomIdValue = room_id && room_id !== '' ? parseInt(room_id) : null;
        const acquisitionDateValue = acquisition_date && acquisition_date !== '' ? acquisition_date : null;
        const warrantyEndValue = warranty_end && warranty_end !== '' ? warranty_end : null;

        await pool.query(
            `UPDATE equipment 
             SET category_id = ?, name = ?, description = ?, serial_number = ?, 
                 model = ?, manufacturer = ?, location = ?, room_id = ?,
                 acquisition_date = ?, warranty_end = ?, useful_life = ?,
                 status = ?, criticality = ?, technical_specs = ?
             WHERE id = ?`,
            [
                category_id, name, description || null, serial_number || null,
                model || null, manufacturer || null, location || null, roomIdValue,
                acquisitionDateValue, warrantyEndValue, usefulLifeValue,
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
// DELETAR EQUIPAMENTO
// =====================================================
exports.deleteEquipment = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await pool.query(
            'SELECT id FROM work_orders WHERE equipment_id = ?',
            [id]
        );

        if (orders.length > 0) {
            return res.status(400).json({ error: 'Equipamento possui ordens de serviço associadas' });
        }

        await pool.query('DELETE FROM equipment WHERE id = ?', [id]);
        res.json({ message: 'Equipamento excluído com sucesso' });

    } catch (error) {
        console.error('Erro ao deletar equipamento:', error);
        res.status(500).json({ error: 'Erro ao deletar equipamento' });
    }
};

// =====================================================
// CATEGORIAS DE EQUIPAMENTOS
// =====================================================
exports.getEquipmentCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(`
            SELECT c.*, COUNT(e.id) as equipment_count
            FROM equipment_categories c
            LEFT JOIN equipment e ON c.id = e.category_id
            GROUP BY c.id
            ORDER BY c.name
        `);
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

exports.updateEquipmentCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        await pool.query(
            'UPDATE equipment_categories SET name = ?, description = ? WHERE id = ?',
            [name, description, id]
        );

        res.json({ message: 'Categoria atualizada com sucesso' });

    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
};

exports.deleteEquipmentCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const [equipment] = await pool.query(
            'SELECT id FROM equipment WHERE category_id = ?',
            [id]
        );

        if (equipment.length > 0) {
            return res.status(400).json({ error: 'Categoria possui equipamentos associados' });
        }

        await pool.query('DELETE FROM equipment_categories WHERE id = ?', [id]);
        res.json({ message: 'Categoria excluída com sucesso' });

    } catch (error) {
        console.error('Erro ao deletar categoria:', error);
        res.status(500).json({ error: 'Erro ao deletar categoria' });
    }
};