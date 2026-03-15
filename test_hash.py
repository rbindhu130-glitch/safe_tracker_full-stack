
import hashlib
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"], 
    deprecated="auto",
    bcrypt__truncate_error=False
)

def hash_password(password: str):
    pre_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    return pwd_context.hash(pre_hash)

def verify_password(plain_password: str, hashed_password: str):
    pre_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
    return pwd_context.verify(pre_hash, hashed_password)

pwd = "my_super_long_password_that_is_longer_than_72_characters_long_long_long_long_long"
hashed = hash_password(pwd)
print(f"Hashed: {hashed}")
print(f"Verify Correct: {verify_password(pwd, hashed)}")
print(f"Verify Wrong: {verify_password(pwd + 'x', hashed)}")
