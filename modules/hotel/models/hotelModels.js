const pool = require('../../../core/config/database');

// Buscar todos os tipos de apartamento
const getAllRoomTypes = async () => {
    const [rows] = await pool.query('SELECT * FROM room_types ORDER BY base_price');
    return rows;
};

// Buscar todos os apartamentos com detalhes
const getAllRooms = async () => {
    const [rows] = await pool.query('SELECT * FROM vw_room_occupancy');
    return rows;
};

// Buscar apartamentos por andar
const getRoomsByFloor = async () => {
    const [rows] = await pool.query(`
        SELECT 
            floor,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', id,
                    'number', room_number,
                    'type', room_type,
                    'status', status,
                    'price', base_price,
                    'guest', current_guest,
                    'checkout', expected_checkout
                )
            ) as rooms
        FROM vw_room_occupancy
        GROUP BY floor
        ORDER BY floor
    `);
    return rows;
};

// Buscar um apartamento específico
const getRoomById = async (id) => {
    const [rows] = await pool.query('SELECT * FROM vw_room_occupancy WHERE id = ?', [id]);
    return rows[0];
};

// Criar novo apartamento
const createRoom = async (roomData) => {
    const { room_number, floor, room_type_id, observations } = roomData;
    const [result] = await pool.query(
        'INSERT INTO rooms (room_number, floor, room_type_id, observations) VALUES (?, ?, ?, ?)',
        [room_number, floor, room_type_id, observations]
    );
    return result.insertId;
};

// Atualizar status do apartamento
const updateRoomStatus = async (id, status) => {
    await pool.query('UPDATE rooms SET status = ? WHERE id = ?', [status, id]);
};

// Atualizar apartamento
const updateRoom = async (id, roomData) => {
    const { room_number, floor, room_type_id, status, observations } = roomData;
    await pool.query(
        `UPDATE rooms 
         SET room_number = ?, floor = ?, room_type_id = ?, status = ?, observations = ?
         WHERE id = ?`,
        [room_number, floor, room_type_id, status, observations, id]
    );
};

// Deletar apartamento
const deleteRoom = async (id) => {
    await pool.query('DELETE FROM rooms WHERE id = ?', [id]);
};

module.exports = {
    getAllRoomTypes,
    getAllRooms,
    getRoomsByFloor,
    getRoomById,
    createRoom,
    updateRoomStatus,
    updateRoom,
    deleteRoom
};