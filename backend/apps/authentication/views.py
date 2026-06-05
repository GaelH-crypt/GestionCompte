from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .serializers import CustomTokenObtainPairSerializer, UserSerializer, ChangePasswordSerializer


class LoginView(TokenObtainPairView):
    permission_classes = (AllowAny,)
    serializer_class = CustomTokenObtainPairSerializer

    @method_decorator(ratelimit(key='ip', rate='5/m', block=True))
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
    except TokenError:
        # Token already blacklisted (e.g. rotated) or expired — session is already invalid.
        pass
    except Exception:
        return Response({'detail': 'Erreur lors de la déconnexion.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me_view(request):
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    serializer = ChangePasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    user = request.user
    if not user.check_password(serializer.validated_data['old_password']):
        return Response({'old_password': 'Mot de passe incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(serializer.validated_data['new_password'], user)
    except DjangoValidationError as e:
        return Response({'new_password': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(serializer.validated_data['new_password'])
    user.save()
    return Response({'detail': 'Mot de passe modifié.'})
