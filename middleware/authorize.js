const pool = require('../config/database');

// Hierarquia de papéis
const roleHierarchy = {
    'hospede': 1,
    'colaborador': 2,
    'admin': 3
};

// Verificar se o usuário tem um papel mínimo
exports.minimumRole = (requiredRole) => {
    return (req, res, next) => {
        // Verificar se req.user existe
        if (!req.user) {
            console.error('❌ authorize.minimumRole: req.user não definido');
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        
        const userRole = req.user.role || 'hospede';
        
        console.log(`🔍 Verificando papel: ${userRole} >= ${requiredRole} ?`);
        
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
            if (!req.user) {
                console.error('❌ authorize.hasPermission: req.user não definido');
                return res.status(401).json({ error: 'Usuário não autenticado' });
            }
            
            const userId = req.user.id;
            const userRole = req.user.role;
            
            // Admin tem todas as permissões
            if (userRole === 'admin') {
                return next();
            }
            
            // Buscar permissão do papel
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

// Verificar se o usuário é o próprio ou admin
exports.isSelfOrAdmin = (paramName = 'id') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        
        const userId = parseInt(req.params[paramName]);
        const currentUserId = req.user.id;
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
// Verificar se o usuário tem permissão para editar reservas
exports.canEditBookings = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    
    const allowedRoles = ['admin', 'colaborador'];
    const hasPermission = allowedRoles.includes(req.user.role);
    
    if (hasPermission) {
        next();
    } else {
        res.status(403).json({ 
            error: 'Acesso negado. Apenas administradores e colaboradores podem editar reservas.' 
        });
    }
};