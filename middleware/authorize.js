const pool = require('../config/database');

// Hierarquia de papéis (para validação simples)
const roleHierarchy = {
    'hospede': 1,
    'colaborador': 2,
    'admin': 3
};

// Verificar se o usuário tem um papel mínimo
exports.minimumRole = (requiredRole) => {
    return (req, res, next) => {
        const userRole = req.user.role || 'hospede';
        
        if (roleHierarchy[userRole] >= roleHierarchy[requiredRole]) {
            next();
        } else {
            res.status(403).json({ 
                error: 'Acesso negado. Nível de acesso insuficiente.' 
            });
        }
    };
};

// Verificar se o usuário tem uma permissão específica
exports.hasPermission = (permissionName) => {
    return async (req, res, next) => {
        try {
            const userId = req.userId;
            
            // Buscar papel do usuário
            const [users] = await pool.query(
                'SELECT role FROM users WHERE id = ?',
                [userId]
            );
            
            if (users.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            
            const userRole = users[0].role;
            
            // Admin tem todas as permissões
            if (userRole === 'admin') {
                return next();
            }
            
            // Verificar se o papel tem a permissão
            const [permissions] = await pool.query(
                `SELECT p.* FROM permissions p
                 JOIN role_permissions rp ON p.id = rp.permission_id
                 WHERE rp.role = ? AND p.name = ?`,
                [userRole, permissionName]
            );
            
            if (permissions.length > 0) {
                next();
            } else {
                res.status(403).json({ 
                    error: 'Acesso negado. Permissão necessária: ' + permissionName 
                });
            }
        } catch (error) {
            console.error('❌ Erro ao verificar permissão:', error);
            res.status(500).json({ error: 'Erro ao verificar permissão' });
        }
    };
};

// Middleware para verificar se o usuário é o próprio ou admin
exports.isSelfOrAdmin = (paramName = 'id') => {
    return (req, res, next) => {
        const userId = parseInt(req.params[paramName]);
        const currentUserId = req.userId;
        const userRole = req.user.role;
        
        if (currentUserId === userId || userRole === 'admin') {
            next();
        } else {
            res.status(403).json({ 
                error: 'Acesso negado. Você só pode acessar seus próprios dados.' 
            });
        }
    };
};