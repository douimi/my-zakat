from flask import request
from flask_restful import Resource
from flask_jwt_extended import (
    create_access_token, create_refresh_token, 
    jwt_required, get_jwt_identity, get_jwt
)
from datetime import datetime
from app import db
from models import Admin

class Login(Resource):
    def post(self):
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return {'message': 'Username and password required'}, 400
        
        admin = Admin.query.filter_by(username=username).first()
        
        if not admin or not admin.check_password(password):
            return {'message': 'Invalid credentials'}, 401
        
        if not admin.is_active:
            return {'message': 'Account is disabled'}, 403
        
        # Update last login
        admin.last_login = datetime.utcnow()
        db.session.commit()
        
        access_token = create_access_token(identity=admin.id)
        refresh_token = create_refresh_token(identity=admin.id)
        
        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': admin.to_dict()
        }, 200

class Register(Resource):
    @jwt_required()
    def post(self):
        # Only existing admins can create new admins
        data = request.get_json()
        
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        
        if not all([username, email, password]):
            return {'message': 'All fields are required'}, 400
        
        if Admin.query.filter_by(username=username).first():
            return {'message': 'Username already exists'}, 409
        
        if Admin.query.filter_by(email=email).first():
            return {'message': 'Email already registered'}, 409
        
        admin = Admin(username=username, email=email)
        admin.set_password(password)
        
        db.session.add(admin)
        db.session.commit()
        
        return {'message': 'Admin created successfully', 'admin': admin.to_dict()}, 201

class Refresh(Resource):
    @jwt_required(refresh=True)
    def post(self):
        identity = get_jwt_identity()
        access_token = create_access_token(identity=identity)
        return {'access_token': access_token}, 200

class Logout(Resource):
    @jwt_required()
    def post(self):
        # In a production app, you might want to blacklist the token here
        return {'message': 'Successfully logged out'}, 200

class Profile(Resource):
    @jwt_required()
    def get(self):
        admin_id = get_jwt_identity()
        admin = Admin.query.get(admin_id)
        
        if not admin:
            return {'message': 'User not found'}, 404
        
        return admin.to_dict(), 200
    
    @jwt_required()
    def put(self):
        admin_id = get_jwt_identity()
        admin = Admin.query.get(admin_id)
        
        if not admin:
            return {'message': 'User not found'}, 404
        
        data = request.get_json()
        
        if 'email' in data:
            if Admin.query.filter_by(email=data['email']).filter(Admin.id != admin_id).first():
                return {'message': 'Email already in use'}, 409
            admin.email = data['email']
        
        if 'password' in data:
            admin.set_password(data['password'])
        
        db.session.commit()
        
        return {'message': 'Profile updated', 'user': admin.to_dict()}, 200
