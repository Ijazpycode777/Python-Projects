from user import Users
class Authentication:
    def __init__(self):
        self.users=[]
    def register(self,name,password):
        for user in self.users:
            if user.name==name:
                print("User already exists.")
                return user
        new_user=Users(name,password)
        self.users.append(new_user)
        print("Registration successful!")
        return new_user
    def login(self,name,password):
        for user in self.users:
            if user.name==name:
                if user.password==password:
                    print("Login successfull!")
                    return user
                else:
                    print("Incorrect password")
                    return None
        print("Username not found.")
        return None
        

